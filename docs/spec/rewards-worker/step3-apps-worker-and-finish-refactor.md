# step3: apps/worker 新規作成 + /finish の enqueue 化 + /generate / reconcile の削除

backend の核心。BullMQ Worker を新規 app として立ち上げ、`/finish` API を「pending 行 INSERT + enqueue するだけ」に縮小する。

## 対応内容

### apps/worker (新規)

`project-template/apps/worker` の構造を踏襲。

#### ディレクトリ構成

```
apps/worker/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.js
├── .env.local                          # 暗号化 (DATABASE_URL / REDIS_URL / REWARDS_CACHE_DIR 等)
├── Dockerfile                          # ECS デプロイ用 (apps/cron と同等)
└── src/
    ├── index.ts
    ├── env.ts
    ├── runtime/
    │   └── graceful-shutdown.ts
    ├── workers/
    │   └── generate-reward-worker.ts
    ├── jobs/
    │   └── generate-reward.ts
    └── repository/
        └── prisma/
            ├── index.ts
            ├── reward-repository.ts
            └── user-repository.ts
```

#### `package.json`

```json
{
  "name": "@apps/worker",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "start": "node dist/src/index.js",
    "dev": "dotenvx run -f .env.local -- ts-node-dev --respawn --transpile-only src/index.ts",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "@repo/errors": "workspace:*",
    "@repo/logger": "workspace:*",
    "@repo/queue": "workspace:*",
    "@repo/redis": "workspace:*",
    "@repo/generate-image": "workspace:*",
    "zod": "..."
  }
}
```

#### `src/env.ts`

```typescript
import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(["debug", "error", "info", "warn"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z.string().url(),
  REWARDS_CACHE_DIR: z.string().default("/tmp/typing-royale-rewards"),
  REWARDS_PUBLIC_URL_PREFIX: z.string().default("/cache/rewards"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
})

const result = envSchema.safeParse(process.env)
if (!result.success) {
  console.error("env validation failed:", result.error.format())
  process.exit(1)
}

export const env = result.data
```

#### `src/index.ts`

```typescript
import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"
import { createRedisClient } from "@repo/redis"

import { env } from "./env"
import { PrismaRewardRepository } from "./repository/prisma/reward-repository"
import { PrismaUserRepository } from "./repository/prisma/user-repository"
import { setupGracefulShutdown } from "./runtime/graceful-shutdown"
import { startGenerateRewardWorker } from "./workers/generate-reward-worker"

const main = (): void => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })
  /** BullMQ Worker は maxRetriesPerRequest: null が必須 */
  const redis = createRedisClient({
    options: { maxRetriesPerRequest: null },
    url: env.REDIS_URL,
  })

  const rewardRepository = new PrismaRewardRepository(prisma)
  const userRepository = new PrismaUserRepository(prisma)

  const consumers = [
    startGenerateRewardWorker({
      cardStorage: {
        baseDir: env.REWARDS_CACHE_DIR,
        publicUrlPrefix: env.REWARDS_PUBLIC_URL_PREFIX,
      },
      concurrency: env.WORKER_CONCURRENCY,
      redis,
      rewardRepository,
      userRepository,
    }),
  ]

  setupGracefulShutdown({ consumers, prisma, redis })

  logger.info("worker started", {
    concurrency: env.WORKER_CONCURRENCY,
    queues: ["generate-reward"],
  })
}

main()
```

#### `src/workers/generate-reward-worker.ts`

```typescript
import {
  GENERATE_REWARD_QUEUE_NAME,
  type JobConsumer,
  startBullMQWorker,
} from "@repo/queue"
import type { Redis } from "@repo/redis"

import { generateReward } from "../jobs/generate-reward"
import type { RewardRepository } from "../repository/prisma/reward-repository"
import type { UserRepository } from "../repository/prisma/user-repository"

export type StartGenerateRewardWorkerArgs = {
    cardStorage: { baseDir: string; publicUrlPrefix: string }
    concurrency: number
    redis: Redis
    rewardRepository: RewardRepository
    userRepository: UserRepository
}

export const startGenerateRewardWorker = (
  args: StartGenerateRewardWorkerArgs,
): JobConsumer =>
  startBullMQWorker(args.redis, {
    concurrency: args.concurrency,
    onFinalFailure: async (job) => {
      /** 3 回失敗 → status="failed" を UPDATE してユーザーには見えなくする */
      await args.rewardRepository.updateGenerationStatus(job.data.rewardId, "failed")
    },
    processor: generateReward({
      cardStorage: args.cardStorage,
      rewardRepository: args.rewardRepository,
      userRepository: args.userRepository,
    }),
    queueName: GENERATE_REWARD_QUEUE_NAME,
  })
```

#### `src/jobs/generate-reward.ts`

```typescript
import { promises as fs } from "node:fs"
import { dirname, join } from "node:path"

import { logger } from "@repo/logger"
import type { GenerateRewardJobData, JobProcessor } from "@repo/queue"
import {
  buildHofBadgeSvg,
  buildMonthlyBadgeSvg,
  renderGradeUpCard,
  renderHallOfFameCard,
  renderMonthlyTopTenCard,
} from "@repo/generate-image"

import type { RewardRepository } from "../repository/prisma/reward-repository"
import type { UserRepository } from "../repository/prisma/user-repository"

export type GenerateRewardDeps = {
    cardStorage: { baseDir: string; publicUrlPrefix: string }
    rewardRepository: RewardRepository
    userRepository: UserRepository
}

/**
 * generate-reward job processor。冪等。
 *
 * 1. rewards から該当行を SELECT
 * 2. generation_status="completed" なら no-op
 * 3. generation_status="processing" に UPDATE
 * 4. type に応じて SVG + PNG を生成
 * 5. PNG を storage に save
 * 6. asset_url / asset_svg_url / generation_status="completed" を UPDATE
 * 7. 失敗時は throw (BullMQ がリトライ判定)
 */
export const generateReward = (deps: GenerateRewardDeps): JobProcessor<GenerateRewardJobData> =>
  async ({ data }) => {
    const reward = await deps.rewardRepository.findById(data.rewardId)
    if (reward === null) {
      logger.warn("generate-reward: reward not found, skipping", { rewardId: data.rewardId })
      return
    }
    if (reward.generationStatus === "completed" && reward.assetUrl !== null) {
      return
    }

    await deps.rewardRepository.updateGenerationStatus(data.rewardId, "processing")

    const user = await deps.userRepository.findPublicProfile(reward.userId)
    if (user === null) {
      /** ユーザーが消えているのは異常だが、リトライ不要なので throw しない */
      logger.warn("generate-reward: user gone, marking failed", { rewardId: data.rewardId })
      await deps.rewardRepository.updateGenerationStatus(data.rewardId, "failed")
      return
    }
    const username = user.githubUsername ?? `user${user.id}`

    /** type 別に SVG + PNG 生成 */
    const { png, svg } = await renderForType(reward, username)

    /** storage save (LocalCardStorage の処理を inline で) */
    const filename = buildFilename(reward)
    const fullPath = join(deps.cardStorage.baseDir, filename)
    await fs.mkdir(dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, png)
    const assetUrl = `${deps.cardStorage.publicUrlPrefix}/${filename}`

    await deps.rewardRepository.updateAssetsAndComplete(data.rewardId, {
      assetSvgUrl: svg,
      assetUrl,
    })
  }

/** type に応じて SVG + PNG を生成 */
const renderForType = async (reward: { ... }, username: string) => {
  // grade_up: renderGradeUpCard
  // hall_of_fame_in: buildHofBadgeSvg + renderHallOfFameCard
  // monthly_top_ten: buildMonthlyBadgeSvg + renderMonthlyTopTenCard
}

/** type 別の filename を構築 */
const buildFilename = (reward: { ... }): string => {
  // grade_up: rewards/<userId>-<rewardId>.png
  // hall_of_fame_in: special-badges/<userId>-hof-<language>.png
  // monthly_top_ten: special-badges/<userId>-monthly-<language>-<yearMonth>.png
}
```

#### `src/runtime/graceful-shutdown.ts`

```typescript
import type { PrismaClient } from "@repo/db"
import { logger } from "@repo/logger"
import type { JobConsumer } from "@repo/queue"
import type { Redis } from "@repo/redis"

export type SetupGracefulShutdownArgs = {
    consumers: JobConsumer[]
    prisma: PrismaClient
    redis: Redis
}

export const setupGracefulShutdown = (args: SetupGracefulShutdownArgs): void => {
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info("graceful shutdown initiated", { signal })
    await Promise.allSettled(args.consumers.map((c) => c.close()))
    await args.prisma.$disconnect()
    args.redis.disconnect()
    logger.info("graceful shutdown complete")
    process.exit(0)
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}
```

### apps/api の refactor

#### `/finish` の責務縮小 (`apps/api/src/service/play-session-service.ts`)

**Before**:
```typescript
if (gradeUp !== null) {
  await rewardsService.createCard({ ... }, { ... })  // 同期生成
}
// pending rows for HoF / Monthly only
```

**After**:
```typescript
// HoF / Monthly / grade_up すべてを pending 行として INSERT
const pendingRewards: PendingReward[] = []

if (gradeUp !== null) {
  const row = await ensurePendingGradeUpReward(repo.rewardRepository, state.userId, gradeUp.to.slug)
  pendingRewards.push({ gradeSlug: gradeUp.to.slug, rewardId: row.id, type: "grade_up" })
}
// (HoF / Monthly は既存通り pendingRewards.push)

/** すべて enqueue */
for (const p of pendingRewards) {
  await repo.generateRewardQueue.enqueue(
    { rewardId: p.rewardId },
    { jobId: buildGenerateRewardJobId(p.rewardId) },
  )
}
```

#### `apps/api/src/index.ts` の DI

```typescript
import { createRedisClient } from "@repo/redis"
import { BullMQJobQueue, GENERATE_REWARD_QUEUE_NAME, type GenerateRewardJobData } from "@repo/queue"

const redis = createRedisClient({ url: env.REDIS_URL })
const generateRewardQueue = new BullMQJobQueue<GenerateRewardJobData>(redis, GENERATE_REWARD_QUEUE_NAME)

// PlaySessionFinishController に生成キューを DI
const playSessionFinishController = new PlaySessionFinishController(
  ...,
  generateRewardQueue,
)
```

#### `pending_rewards` schema 拡張 (`packages/schema/src/api-schema/rewards.ts`)

```typescript
export const pendingRewardSchema = z.discriminatedUnion("type", [
  z.object({
    language: z.enum(["javascript", "typescript"]),
    rank: z.number().int().min(1).max(10),
    reward_id: z.number().int().positive(),
    type: z.literal("hall_of_fame_in"),
  }),
  z.object({
    language: z.enum(["javascript", "typescript"]),
    rank: z.number().int().min(1).max(10),
    reward_id: z.number().int().positive(),
    type: z.literal("monthly_top_ten"),
    year_month: z.string().regex(/^\d{4}-\d{2}$/),
  }),
  /** NEW */
  z.object({
    grade_slug: z.string().min(1),
    reward_id: z.number().int().positive(),
    type: z.literal("grade_up"),
  }),
])
```

### 削除

```
apps/api/src/controller/rewards/generate.ts                          # 削除
apps/api/src/service/rewards-service.ts::generateReward (export)     # 削除
apps/api/src/service/rewards-service.ts::reconcilePendingRewards     # 削除
apps/api/src/routes/rewards-router.ts の generate ルート登録        # 削除
apps/api/src/controller/auth/github.ts の reconcile 呼び出し         # 削除
apps/api/src/controller/auth/github.ts の cardStorage / rewardRepository コンストラクタ引数  # 削除
apps/web/src/app/api/internal/rewards/generate/route.ts              # 削除
apps/web/src/app/play/[sessionId]/result-screen.tsx の fire-and-forget useEffect  # step4 で削除
```

## 動作確認

### 単体テスト

#### `apps/worker/test/jobs/generate-reward.test.ts`

```typescript
describe("generateReward (worker job)", () => {
  describe("正常系", () => {
    it("grade_up reward を SVG + PNG 生成して completed に更新", async () => { ... })
    it("hall_of_fame_in reward を SVG + PNG 生成", async () => { ... })
    it("monthly_top_ten reward を SVG + PNG 生成", async () => { ... })
    it("既に completed なら no-op", async () => { ... })
    it("processing 中の reward でも再生成して上書き (冪等)", async () => { ... })
  })

  describe("異常系", () => {
    it("reward が存在しなければ early return", async () => { ... })
    it("user が存在しなければ failed に UPDATE", async () => { ... })
    it("render が throw したら throw (BullMQ がリトライ判定)", async () => { ... })
  })
})
```

### Integration テスト

#### `apps/api/test/controller/play-session/finish.test.ts` の更新

- `generateRewardQueue.enqueue` を mock で受けて、`/finish` 後に enqueue されることを assert
- grade_up が発生したケースでも **同期生成しない** ことを assert (mock が呼ばれない or storage に書かれない)
- `pending_rewards` に grade_up が含まれることを assert

#### local dev での手動確認

```bash
# Terminal 1: API
pnpm --filter api dev

# Terminal 2: Worker
pnpm --filter @apps/worker dev

# Terminal 3: Web (step4 のため)
pnpm --filter web dev

# Terminal 4: プレイして TOP 10 入賞 + grade_up を発生させ、以下を確認
# 1. /finish が 1 秒以内に返る (秒単位の遅延が消えている)
# 2. rewards テーブルに pending 行が即 INSERT される (status="pending")
# 3. worker のログに「processing → completed」のステート遷移が出る
# 4. 数秒後 asset_url / asset_svg_url が埋まる
```
