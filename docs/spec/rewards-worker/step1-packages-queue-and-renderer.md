# step1: packages/queue + packages/reward-renderer 新規作成

`apps/api` と `apps/worker` の両方が利用する共通基盤を 2 つの新規パッケージとして整備する。

- `packages/queue`: BullMQ ベースの Job Queue 抽象（producer / consumer の interface 統一）
- `packages/reward-renderer`: SVG / PNG 生成ロジック（既存 `apps/api/src/lib/badge-svg-*.ts` / `card-renderer.ts` を移動）

## 対応内容

### packages/queue

`project-template/packages/queue` を踏襲。

#### ディレクトリ構成

```
packages/queue/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.js
└── src/
    ├── index.ts
    ├── types.ts
    ├── bullmq-queue.ts
    └── jobs/
        ├── index.ts
        └── generate-reward.ts
```

#### `package.json`

```json
{
  "name": "@repo/queue",
  "version": "1.0.0",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  },
  "dependencies": {
    "bullmq": "^5.x",
    "@repo/logger": "workspace:*",
    "@repo/redis": "workspace:*"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*"
  }
}
```

#### `src/types.ts`

```typescript
export type JobMessage<T> = {
    attemptsMade: number
    data: T
    id: string
}

export type JobProcessor<T> = (message: JobMessage<T>) => Promise<void>

export type EnqueueOptions = {
    delayMs?: number
    jobId?: string
}

export interface JobQueue<T> {
    close(): Promise<void>
    enqueue(data: T, options?: EnqueueOptions): Promise<void>
}

export type StartWorkerOptions<T> = {
    concurrency?: number
    processor: JobProcessor<T>
    queueName: string
    /** 3 回まで失敗したジョブを「最終失敗」として扱うコールバック (status="failed" 書き込み用) */
    onFinalFailure?: (job: { data: T; failedReason: string; id: string }) => Promise<void>
}

export interface JobConsumer {
    close(): Promise<void>
}
```

#### `src/bullmq-queue.ts`

```typescript
import { Queue, Worker } from "bullmq"

import { logger } from "@repo/logger"
import type { Redis } from "@repo/redis"

import type {
  EnqueueOptions,
  JobConsumer,
  JobQueue,
  StartWorkerOptions,
} from "./types"

export class BullMQJobQueue<T> implements JobQueue<T> {
  private _queue: Queue<T>

  constructor(redis: Redis, queueName: string) {
    this._queue = new Queue<T>(queueName, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5000, type: "exponential" },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      },
    })
  }

  async enqueue(data: T, options?: EnqueueOptions): Promise<void> {
    await this._queue.add(this._queue.name, data, {
      delay: options?.delayMs,
      jobId: options?.jobId,
    })
  }

  async close(): Promise<void> {
    await this._queue.close()
  }
}

export const startBullMQWorker = <T>(
  redis: Redis,
  options: StartWorkerOptions<T>,
): JobConsumer => {
  const worker = new Worker<T>(
    options.queueName,
    async (job) => {
      await options.processor({
        attemptsMade: job.attemptsNumber - 1,
        data: job.data,
        id: job.id ?? "",
      })
    },
    {
      concurrency: options.concurrency ?? 1,
      connection: redis,
    },
  )

  worker.on("failed", (job, err) => {
    logger.warn("BullMQ job failed", {
      attemptsMade: job?.attemptsMade,
      error: err.message,
      jobId: job?.id,
      queue: options.queueName,
    })
    /** 最終失敗 (attempts 上限到達) のみ onFinalFailure を呼ぶ */
    if (job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 3) && options.onFinalFailure) {
      void options.onFinalFailure({
        data: job.data,
        failedReason: err.message,
        id: job.id ?? "",
      }).catch((e: unknown) => {
        logger.error("onFinalFailure callback failed", {
          error: e instanceof Error ? e.message : String(e),
        })
      })
    }
  })

  return {
    close: async () => {
      await worker.close()
    },
  }
}
```

#### `src/jobs/generate-reward.ts`

```typescript
export const GENERATE_REWARD_QUEUE_NAME = "generate-reward"

/**
 * generate-reward Queue: reward の SVG / PNG を非同期生成する。
 *
 * Producer (apps/api の /finish): pending 行 INSERT 後、rewardId を data に
 * enqueue する。jobId は rewardId 単位で決定的に生成して重複排除する。
 * Consumer (apps/worker): rewards から該当行を読み出し、SVG/PNG を生成して
 * asset_url / asset_svg_url / generation_status を update する。
 */
export type GenerateRewardJobData = {
    rewardId: number
}

export const buildGenerateRewardJobId = (rewardId: number): string =>
  `generate-reward-${rewardId}`
```

#### `src/jobs/index.ts`

```typescript
export * from "./generate-reward"
```

#### `src/index.ts`

```typescript
export * from "./bullmq-queue"
export * from "./jobs"
export * from "./types"
```

### packages/reward-renderer

`apps/api/src/lib/badge-svg-hof.ts` / `badge-svg-monthly.ts` / `card-renderer.ts` を **そのまま移動**する。

#### ディレクトリ構成

```
packages/reward-renderer/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.js
└── src/
    ├── index.ts
    ├── badge-svg-hof.ts
    ├── badge-svg-monthly.ts
    └── card-renderer.ts
```

#### `package.json`

```json
{
  "name": "@repo/reward-renderer",
  "version": "1.0.0",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  },
  "dependencies": {
    "satori": "...",
    "@resvg/resvg-js": "...",
    "@repo/logger": "workspace:*"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*"
  }
}
```

#### 移動に伴う import 修正

- `apps/api/src/types/domain/reward.ts` の `RewardLanguage` 型は `packages/reward-renderer` 側でも必要なので、
    - **option A**: 型をコピーして `packages/reward-renderer/src/types.ts` に置く
    - **option B**: 型を `@repo/db` 等の共通 package に移して両方から import する
- 本 step では **A (型コピー)** を採用（重複は技術負債として記録、将来 schema 共通化時にまとめる）

#### `src/index.ts`

```typescript
export * from "./badge-svg-hof"
export * from "./badge-svg-monthly"
export * from "./card-renderer"
```

### apps/api 側の調整

#### 削除（既存ファイル）

```
apps/api/src/lib/badge-svg-hof.ts          → packages/reward-renderer/src/badge-svg-hof.ts に移動
apps/api/src/lib/badge-svg-monthly.ts      → packages/reward-renderer/src/badge-svg-monthly.ts に移動
apps/api/src/lib/card-renderer.ts          → packages/reward-renderer/src/card-renderer.ts に移動
```

#### import 変更

`apps/api/src/service/rewards-service.ts` 等で:

```typescript
// before
import { renderGradeUpCard } from "../lib/card-renderer"
import { buildHofBadgeSvg } from "../lib/badge-svg-hof"

// after
import { buildHofBadgeSvg, renderGradeUpCard } from "@repo/reward-renderer"
```

#### `apps/api/package.json` 更新

```json
{
  "dependencies": {
    "@repo/queue": "workspace:*",
    "@repo/reward-renderer": "workspace:*"
  }
}
```

### turbo.json

新規 package をビルドパイプラインに追加（既存のパターンと同じ）。

```jsonc
{
  "tasks": {
    "build": {
      "dependsOn": ["^build", "@repo/db#db:generate"]
    }
  }
}
```

`^build` ですべての workspace package が dependsOn されるので、追加変更は不要。

## 動作確認

```bash
pnpm install
pnpm --filter @repo/queue build         # → dist/src/index.js / index.d.ts
pnpm --filter @repo/reward-renderer build
pnpm --filter api build                 # 既存 api がエラーなく build できる
pnpm --filter api test                  # 既存 test がパスする
pnpm --filter api vitest run test/lib/badge-svg-hof.test.ts  # 既存テストファイル位置は変えても OK
```

新規追加した型のテスト:

```typescript
// packages/queue/test/jobs/generate-reward.test.ts (vitest)
import { buildGenerateRewardJobId, GENERATE_REWARD_QUEUE_NAME } from "../../src/jobs/generate-reward"

describe("buildGenerateRewardJobId", () => {
  it("rewardId から決定的な jobId を返す", () => {
    expect(buildGenerateRewardJobId(123)).toBe("generate-reward-123")
  })
})

describe("GENERATE_REWARD_QUEUE_NAME", () => {
  it('"generate-reward" 文字列で固定', () => {
    expect(GENERATE_REWARD_QUEUE_NAME).toBe("generate-reward")
  })
})
```
