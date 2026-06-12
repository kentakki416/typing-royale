# step1: API — claim ticket の発行と消費

API 側を完結させるステップ。`/guest/finish` のレスポンスに `claim_ticket` を追加し、Redis に完走時データを 15 分 TTL で保存する。新規エンドポイント `POST /api/play-sessions/claim` を追加して、ticket 経由で `persistFinishedSessionAtomic` を呼び 5 テーブルへ atomic 書き込みを行う。

## 対応内容

### Schema（`packages/schema/src/api-schema/play-session.ts`）

#### `finishGuestPlaySessionResponseSchema` に `claim_ticket` を追加

```ts
export const finishGuestPlaySessionResponseSchema = z.object({
  accuracy: z.number(),
  /**
   * 完走スコアをログイン後に保存するための不透明 ticket。
   * クライアントは sessionStorage に保持し、ログイン後に POST /api/play-sessions/claim
   * へ送る。Redis 上の TTL は 15 分
   */
  claim_ticket: z.string().uuid(),
  mistype_stats: mistypeStatsSchema,
  problems_completed: z.number().int().nonnegative(),
  problems_played: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  typed_chars: z.number().int().nonnegative(),
})
```

#### claim 用 schema 追加

```ts
// ========================================================
// POST /api/play-sessions/claim - ゲストプレイの事後ログイン保存
// ========================================================

/**
 * claim リクエスト
 */
export const claimGuestPlaySessionRequestSchema = z.object({
  claim_ticket: z.string().uuid(),
})

/**
 * claim レスポンス
 * ログイン経由の /finish と完全同形（クライアントが区別なく扱える）
 */
export const claimGuestPlaySessionResponseSchema = finishPlaySessionResponseSchema

export type ClaimGuestPlaySessionRequest = z.infer<typeof claimGuestPlaySessionRequestSchema>
export type ClaimGuestPlaySessionResponse = z.infer<typeof claimGuestPlaySessionResponseSchema>
```

### Domain 型（`apps/api/src/types/domain/play-session.ts`）

```ts
/**
 * /guest/finish 時に Redis に揮発保存する claim 用データ
 *
 * key: claim:{uuid}, TTL: 900 秒（15 分）
 * 完走時点で物理限界チェック + サーバー再集計済みの validated データを保持する。
 * claim 時は ticket UUID から本データを引き、persistFinishedSessionAtomic で
 * 5 テーブルに書き込む（state.userId は claim 時の OAuth 認証ユーザー）。
 */
export type GuestClaimTicketData = {
    accuracy: number
    crawledRepoId: number
    ghostSessionId: number | null
    keystrokeLogs: KeystrokeLogs
    languageId: number
    mistypeStats: MistypeStats
    mode: PlaySessionMode
    playedAt: string
    problemIds: number[]
    problemsCompleted: number
    problemsPlayed: number
    score: number
    typedChars: number
}
```

### Redis Repository（`apps/api/src/repository/redis/guest-claim-ticket-repository.ts` 新規）

```ts
import type { Redis } from "@repo/redis"

import { GuestClaimTicketData } from "../../types/domain"

export interface GuestClaimTicketRepository {
    delete(ticket: string): Promise<void>
    findByTicket(ticket: string): Promise<GuestClaimTicketData | null>
    save(ticket: string, data: GuestClaimTicketData, ttlSeconds: number): Promise<void>
}

const keyOf = (ticket: string): string => `claim:${ticket}`

export class IoRedisGuestClaimTicketRepository implements GuestClaimTicketRepository {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  async save(ticket: string, data: GuestClaimTicketData, ttlSeconds: number): Promise<void> {
    await this._redis.set(keyOf(ticket), JSON.stringify(data), "EX", ttlSeconds)
  }

  async findByTicket(ticket: string): Promise<GuestClaimTicketData | null> {
    const raw = await this._redis.get(keyOf(ticket))
    if (raw === null) return null
    return JSON.parse(raw) as GuestClaimTicketData
  }

  async delete(ticket: string): Promise<void> {
    await this._redis.del(keyOf(ticket))
  }
}
```

### const（`apps/api/src/const/index.ts`）

claim ticket の TTL を集約：

```ts
/**
 * ゲストプレイ claim ticket の Redis TTL（秒）
 * OAuth 往復 + ユーザー躊躇分の余裕として 15 分
 */
export const GUEST_CLAIM_TICKET_TTL_SECONDS = 900
```

### Service の変更（`apps/api/src/service/play-session-service.ts`）

#### `finishGuestSession` を改修

```ts
// 既存の戻り値に加えて、Redis 保存 + ticket 発行を行う
export type FinishGuestSessionOutput = {
    accuracy: number
    claimTicket: string                  // ← 追加
    mistypeStats: MistypeStats
    problemsCompleted: number
    problemsPlayed: number
    score: number
    typedChars: number
}

type GuestFinishSessionRepo = {
    crawledRepoRepository: CrawledRepoRepository  // ← languageId → crawledRepoId 解決用
    guestClaimTicketRepository: GuestClaimTicketRepository  // ← 追加
    problemRepository: ProblemRepository
}

export type FinishGuestSessionInput = {
    accuracy: number
    /**
     * /guest/solo or /guest/challenge-gods のレスポンスから持ち回る情報。
     * Redis state を持たないため、claim に必要なメタも client が送る
     */
    crawledRepoId: number
    ghostSessionId: number | null
    keystrokeLogs: KeystrokeLogs
    languageId: number
    mode: PlaySessionMode
    problemIds: number[]
    typedChars: number
}

export const finishGuestSession = async (
  input: FinishGuestSessionInput,
  repo: GuestFinishSessionRepo,
): Promise<Result<FinishGuestSessionOutput>> => {
  /** 既存の computeServerAggregate 呼び出しは変更なし */
  const agg = await computeServerAggregate(input, repo)
  if (!agg.ok) return agg

  /** claim 用に Redis へ save */
  const claimTicket = randomUUID()
  await repo.guestClaimTicketRepository.save(
    claimTicket,
    {
      accuracy: input.accuracy,
      crawledRepoId: input.crawledRepoId,
      ghostSessionId: input.ghostSessionId,
      keystrokeLogs: input.keystrokeLogs,
      languageId: input.languageId,
      mistypeStats: agg.value.mistypeStats,
      mode: input.mode,
      playedAt: new Date().toISOString(),
      problemIds: input.problemIds,
      problemsCompleted: agg.value.problemsCompleted,
      problemsPlayed: agg.value.problemsPlayed,
      score: agg.value.score,
      typedChars: input.typedChars,
    },
    GUEST_CLAIM_TICKET_TTL_SECONDS,
  )

  return ok({
    accuracy: input.accuracy,
    claimTicket,
    mistypeStats: agg.value.mistypeStats,
    problemsCompleted: agg.value.problemsCompleted,
    problemsPlayed: agg.value.problemsPlayed,
    score: agg.value.score,
    typedChars: input.typedChars,
  })
}
```

> 注: `/guest/solo` `/guest/challenge-gods` のレスポンスにも `crawled_repo_id` `language_id` `mode` `ghost_session_id` をクライアントに返す形に揃える必要がある（claim に必要なため）。スキーマ修正は本 step に含める。

#### `claimGuestSession` Service 新規

```ts
type ClaimGuestSessionRepo = FinishSessionRepo & {
    guestClaimTicketRepository: GuestClaimTicketRepository
}

export type ClaimGuestSessionInput = {
    claimTicket: string
    userId: number
}

/**
 * ゲストプレイ完走後のスコアをログイン済みユーザーに紐付けて保存する
 *
 * 1. Redis から ticket data を取得（無ければ 404）
 * 2. persistFinishedSessionAtomic で 5 テーブルに atomic 書き込み
 *    state.userId は input.userId（claim を要求した認証ユーザー）
 * 3. Redis ticket を削除（二重 claim 防止）
 * 4. ランキング + rewards (finishSession と同じロジック)
 *
 * セキュリティ:
 * - ticket data は /guest/finish 時点でサーバー側 validated なので改ざんリスクなし
 * - userId はリクエストの req.userId を使うため、他人のアカウントへの claim 不可
 */
export const claimGuestSession = async (
  input: ClaimGuestSessionInput,
  repo: ClaimGuestSessionRepo,
): Promise<Result<FinishResult>> => {
  logger.debug("PlaySessionService: Claiming guest session", { claimTicket: input.claimTicket })

  const data = await repo.guestClaimTicketRepository.findByTicket(input.claimTicket)
  if (data === null) {
    return err(notFoundError("Claim ticket not found or expired"))
  }

  const state: PlaySessionState = {
    crawledRepoId: data.crawledRepoId,
    ghostSessionId: data.ghostSessionId,
    languageId: data.languageId,
    mode: data.mode,
    problemIds: data.problemIds,
    userId: input.userId,
  }

  const playedAt = new Date(data.playedAt)
  const problemProgress = aggregateProblemProgress(
    data.keystrokeLogs,
    buildCodeBlockByOrder(
      data.problemIds,
      await repo.problemRepository.findManyByIds(data.problemIds),
    ),
  )

  const { bestScoreUpdated, gradeUp } = await persistFinishedSessionAtomic(
    {
      accuracy: data.accuracy,
      keystrokeLogs: data.keystrokeLogs,
      mistypeStats: data.mistypeStats,
      playedAt,
      problemProgress,
      problemsCompleted: data.problemsCompleted,
      problemsPlayed: data.problemsPlayed,
      score: data.score,
      state,
      typedChars: data.typedChars,
    },
    repo,
  )

  await repo.guestClaimTicketRepository.delete(input.claimTicket)

  /** ランキング + rewards は finishSession と同じロジックを呼ぶ（共通化推奨） */
  // ... (newRank, topTenBoundaryScore の取得 + rewards.createCard)

  return ok({
    accuracy: data.accuracy,
    bestScoreUpdated,
    gradeUp: gradeUp === null ? null : { from: ..., to: ... },
    mistypeStats: data.mistypeStats,
    newRank,
    persisted: true,
    problemsCompleted: data.problemsCompleted,
    problemsPlayed: data.problemsPlayed,
    score: data.score,
    topTenBoundaryScore,
    typedChars: data.typedChars,
  })
}
```

> 注: `finishSession` の「ランキング集計 + rewards 生成」部分は claim と共通なので、`finalizePersistedSession` のような内部ヘルパーに抽出する。play-session-service の refactor PR で導入した `computeServerAggregate` と同じパターン。

### Controller 新規（`apps/api/src/controller/play-session/claim.ts`）

```ts
import { Response } from "express"

import { claimGuestPlaySessionRequestSchema, claimGuestPlaySessionResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { /* repository imports */ } from "../../repository/prisma"
import { GuestClaimTicketRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * POST /api/play-sessions/claim
 *
 * ゲストプレイ完走後に発行された claim_ticket を使って、認証済みユーザーに
 * スコアを紐付けて DB に保存する。認証必須。
 */
export class PlaySessionClaimController {
  constructor(
    /* 既存の FinishSessionRepo に必要な repository 群 + guestClaimTicketRepository */
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { claim_ticket: claimTicket } = parseRequest(claimGuestPlaySessionRequestSchema, req.body)

    logger.info("PlaySessionClaimController: Claiming", { claimTicket, userId: req.userId })

    const result = await service.playSession.claimGuestSession(
      { claimTicket, userId: req.userId! },
      { /* repository 集約 */ },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(claimGuestPlaySessionResponseSchema, {
      /* FinishResult → snake_case 変換、finish.ts と同型 */
    })
    return res.status(200).json(response)
  }
}
```

### Router（`apps/api/src/routes/play-session-router.ts`）

```ts
type PlaySessionRouterControllers = {
    claim?: PlaySessionClaimController  // ← 追加
    finish?: PlaySessionFinishController
    /** ... 既存 ... */
}

/**
 * POST /api/play-sessions/claim
 * 認証必須経路。static path なので /:id/finish より上に登録する必要は無いが、
 * 既存の guest 系より上にまとめる
 */
if (controllers.claim) {
  const controller = controllers.claim
  router.post("/claim", async (req, res) => controller.execute(req, res))
}
```

### DI 配線（`apps/api/src/index.ts`）

`guestClaimTicketRepository` を IoRedis から生成 → `finishGuestController` と新規 `claimController` に注入。

### PUBLIC_PATHS

`/api/play-sessions/claim` は **認証必須**。`PUBLIC_PATHS` には追加しない。`/api/play-sessions/guest` プレフィックスにマッチしないので、既存 strict 認証が自動的に効く。

## 動作確認

### Service unit テスト（`apps/api/test/service/play-session-service/claim-guest-session.test.ts` 新規）

```typescript
describe("claimGuestSession", () => {
  describe("正常系", () => {
    it("有効な ticket で 5 Repository が tx 付きで呼ばれ、Redis ticket が削除される", async () => {
      // Redis に validated data を seed
      // service.claimGuestSession を呼ぶ
      // persistFinishedSessionAtomic 系の 5 Repository が呼ばれることを assert
      // guestClaimTicketRepository.delete が呼ばれることを assert
    })

    it("ベスト更新 + gradeUp が発生したケース、レスポンスに new_rank / grade_up が乗る", async () => {
      // upsertIfBest mockResolvedValue で { updated: true }
      // upsertOnFinish mockResolvedValue で gradeUp あり
    })
  })

  describe("異常系", () => {
    it("ticket が Redis に無い場合、404 を返し DB 書き込みは行われない", async () => {
      // findByTicket mockResolvedValue(null)
      // result.error.statusCode === 404 を assert
      // transactionRunner.run が呼ばれないことを assert
    })
  })
})
```

### Controller integration テスト（`apps/api/test/controller/play-session/claim.test.ts` 新規）

実 Redis + 実 Postgres を使う inhouse テスト。

```typescript
describe("POST /api/play-sessions/claim", () => {
  describe("正常系", () => {
    it("有効な ticket + 認証で 200、5 テーブルに書き込まれ、Redis ticket が削除される", async () => {
      // 事前: language / crawledRepo / problems を seed
      // 事前: guestClaimTicketRepository に直接 save
      // 事前: createTestUser で token 取得
      // 事前: ranking_snapshot 等の依存も seed

      // POST /api/play-sessions/claim { claim_ticket } with Bearer
      // status === 200
      // body は FinishPlaySessionResponse 形（persisted=true）
      // testPrisma.playSession.count() === 1
      // testPrisma.userLifetimeStats.findUnique → bestScore 更新
      // testRedis.get("claim:{ticket}") === null
    })

    it("既に最新ベストがある状態 → best_score_updated=false、play_sessions には積まれる", async () => {
      // 既存ベスト 200 を seed
      // claim で score 100 を送る
      // best_score_updated=false / play_sessions.count === 2 を確認
    })
  })

  describe("異常系", () => {
    it("認証なしの場合、401 を返す", async () => {
      const res = await request(app)
        .post("/api/play-sessions/claim")
        .send({ claim_ticket: "550e8400-e29b-41d4-a716-446655440000" })
      expect(res.status).toBe(401)
    })

    it("存在しない ticket は 404 を返し DB に書き込まない", async () => {
      const { token } = await createTestUser()
      const res = await request(app)
        .post("/api/play-sessions/claim")
        .set("Authorization", `Bearer ${token}`)
        .send({ claim_ticket: "550e8400-e29b-41d4-a716-446655440000" })
      expect(res.status).toBe(404)
      expect(await testPrisma.playSession.count()).toBe(0)
    })

    it("claim_ticket が UUID でないなら 400 を返す", async () => {
      // schema 違反
    })
  })
})
```

### `finishGuestSession` のテスト追補

既存の `guest-finish.test.ts` に追加：

```typescript
it("成功時、レスポンスに claim_ticket が含まれ、Redis にデータが保存される", async () => {
  // POST /api/play-sessions/guest/finish
  // body.claim_ticket がセット
  // testRedis.get("claim:{ticket}") が JSON.parse で GuestClaimTicketData を返す
  // TTL が ~900 秒前後（ttl コマンドで確認）
})
```

### ローカル動作確認

1. `pnpm --filter @repo/db db:migrate:deploy && pnpm --filter api dev` で起動
2. `pnpm --filter api test:ci` で 全 controller integration テスト pass
3. curl での疎通：

```bash
# /guest/finish が claim_ticket を返すこと
curl -s -X POST http://localhost:8080/api/play-sessions/guest/finish \
  -H "Content-Type: application/json" \
  -d '{"accuracy":1,"keystroke_logs":[...],"problem_ids":[...],...}'

# /claim が認証なしで 401
curl -s -X POST http://localhost:8080/api/play-sessions/claim \
  -H "Content-Type: application/json" \
  -d '{"claim_ticket":"..."}'

# 認証ありで 200 (token は pnpm --filter api issue-test-token で取得)
curl -s -X POST http://localhost:8080/api/play-sessions/claim \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"claim_ticket":"..."}'
```
