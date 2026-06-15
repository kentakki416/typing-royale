# step3: API — GET /api/rankings/monthly

`monthly_ranking_snapshots` から当月のランキング上位 N 件を返す公開エンドポイント。集計は cron バッチが済ませているので、API は単純な SELECT のみ。

## 対応内容

### スキーマ（`packages/schema/src/api-schema/ranking.ts` に追記）

```ts
// ========================================================
// GET /api/rankings/monthly - 当月の言語別 TOP N
// ========================================================

/**
 * 当月の言語別ランキング取得のクエリ
 */
export const getMonthlyRankingsQueryStringSchema = z.object({
  language: z.enum(["typescript", "javascript"]),
  limit: z.coerce.number().int().min(1).max(10).default(5),
})

/**
 * 当月ランキング 1 エントリ
 */
export const monthlyRankingEntrySchema = z.object({
  accuracy: z.number(),
  played_at: z.string().datetime(),
  rank: z.number().int().positive(),
  score: z.number().int().nonnegative(),
  user: z.object({
    avatar_url: z.string().url().nullable(),
    current_grade: z.string(),
    display_name: z.string(),
    id: z.number().int().positive(),
  }),
})

/**
 * 当月ランキングのレスポンス
 */
export const getMonthlyRankingsResponseSchema = z.object({
  entries: z.array(monthlyRankingEntrySchema),
  /** "YYYY-MM" 形式 (JST) */
  year_month: z.string().regex(/^\d{4}-\d{2}$/),
})

export type GetMonthlyRankingsQueryString = z.infer<typeof getMonthlyRankingsQueryStringSchema>
export type GetMonthlyRankingsResponse = z.infer<typeof getMonthlyRankingsResponseSchema>
```

スキーマ追加後は `cd packages/schema && pnpm build`。

### Repository（`apps/api/src/repository/prisma/monthly-ranking-snapshot-repository.ts`）

apps/cron に既に同名の repository があるが、apps/api は読み取り専用なので別に持つ（package 越境共有はしない方針、`docs/spec/shared-packages/README.md`）：

```ts
import { PrismaClient } from "@repo/db"

export type MonthlyRankingTopEntry = {
  accuracy: number
  playedAt: Date
  rank: number
  score: number
  user: {
    avatarUrl: string | null
    currentGrade: string
    displayName: string
    id: number
  }
}

export interface MonthlyRankingSnapshotRepository {
  findTopByLanguage: (yearMonth: string, languageId: number, limit: number) => Promise<MonthlyRankingTopEntry[]>
}

export class PrismaMonthlyRankingSnapshotRepository implements MonthlyRankingSnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findTopByLanguage = async (yearMonth: string, languageId: number, limit: number): Promise<MonthlyRankingTopEntry[]> => {
    const rows = await this.prisma.monthlyRankingSnapshot.findMany({
      include: {
        user: {
          include: { lifetimeStats: { select: { currentGrade: true } } },
        },
      },
      orderBy: { rank: "asc" },
      take: limit,
      where: { languageId, yearMonth },
    })
    return rows.map((r) => ({
      accuracy: r.accuracy,
      playedAt: r.playedAt,
      rank: r.rank,
      score: r.score,
      user: {
        avatarUrl: r.user.avatarUrl,
        currentGrade: r.user.lifetimeStats?.currentGrade ?? "intern",
        displayName: r.user.displayName,
        id: r.user.id,
      },
    }))
  }
}
```

### Service（`apps/api/src/service/ranking-service.ts` に関数を追加）

既存の `list` / `findMine` と並ぶ、同ファイル内に export。**業務エラーは Result で、想定外は throw（apps/api の CLAUDE.md 準拠）**：

```ts
import { err, ok, badRequestError, type Result } from "@repo/errors"

/**
 * GET /api/rankings/monthly のサービス層
 */
export const listMonthly = async (
  input: { language: "javascript" | "typescript"; limit: number },
  repo: {
    languageRepository: LanguageRepository
    monthlyRankingSnapshotRepository: MonthlyRankingSnapshotRepository
  }
): Promise<Result<{ entries: MonthlyRankingTopEntry[]; yearMonth: string }>> => {
  logger.debug("RankingService: listMonthly", { language: input.language, limit: input.limit })

  const language = await repo.languageRepository.findBySlug(input.language)
  if (language === null) {
    return err(badRequestError(`Unsupported language: ${input.language}`))
  }

  /** JST 当月 (YYYY-MM) を計算 */
  const yearMonth = currentYearMonthJst()

  const entries = await repo.monthlyRankingSnapshotRepository.findTopByLanguage(
    yearMonth,
    language.id,
    input.limit
  )

  return ok({ entries, yearMonth })
}

const currentYearMonthJst = (): string => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}`
}
```

### Controller（`apps/api/src/controller/ranking/monthly-list.ts`）

```ts
import type { Request, Response } from "express"

import { getMonthlyRankingsQueryStringSchema, getMonthlyRankingsResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import * as service from "../../service"
import type { LanguageRepository, MonthlyRankingSnapshotRepository } from "../../repository/prisma"

export class RankingMonthlyListController {
  constructor(
    private readonly languageRepository: LanguageRepository,
    private readonly monthlyRankingSnapshotRepository: MonthlyRankingSnapshotRepository
  ) {}

  execute = async (req: Request, res: Response) => {
    const query = parseRequest(getMonthlyRankingsQueryStringSchema, req.query)

    const result = await service.ranking.listMonthly(
      { language: query.language, limit: query.limit },
      {
        languageRepository: this.languageRepository,
        monthlyRankingSnapshotRepository: this.monthlyRankingSnapshotRepository,
      }
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getMonthlyRankingsResponseSchema, {
      entries: result.value.entries.map((e) => ({
        accuracy: e.accuracy,
        played_at: e.playedAt.toISOString(),
        rank: e.rank,
        score: e.score,
        user: {
          avatar_url: e.user.avatarUrl,
          current_grade: e.user.currentGrade,
          display_name: e.user.displayName,
          id: e.user.id,
        },
      })),
      year_month: result.value.yearMonth,
    })
    return res.status(200).json(response)
  }
}
```

### Router（既存 `apps/api/src/routes/ranking-router.ts` に追加）

```ts
type RankingRouterControllers = {
  list?: RankingListController
  monthlyList?: RankingMonthlyListController  // 追加
}

export const rankingRouter = (controllers: RankingRouterControllers): Router => {
  const router = Router()
  if (controllers.list) {
    router.get("/", controllers.list.execute)
  }
  if (controllers.monthlyList) {
    router.get("/monthly", controllers.monthlyList.execute)  // 追加
  }
  return router
}
```

### `apps/api/src/index.ts` の DI 組み立て

```ts
const monthlyRankingSnapshotRepository = new PrismaMonthlyRankingSnapshotRepository(prisma)
// ...
app.use(
  "/api/rankings",
  rankingRouter({
    list: new RankingListController(/* ... */),
    monthlyList: new RankingMonthlyListController(languageRepository, monthlyRankingSnapshotRepository),
  })
)
```

### proxy.ts (web) の PUBLIC_PATHS 不要

既に `/api/play-sessions/guest` のように public/protected を判定しているが、`/api/rankings` 系は API 側で認証不要。Web からは `/api/internal/...` のような proxy を経由せず、Server Component で `apiClient.get` する想定。`/api/internal/monthly-rankings/...` のような proxy を新設するかは web 側の step4 で扱う。

## 動作確認

Service テストは `vi.fn()` で repository をモックして「Result の構造」と「クエリの渡し方」を検証する（apps/api の CLAUDE.md の方針通り、文字列を assert しない）：

```ts
// apps/api/test/service/ranking-service/list-monthly.test.ts
import { describe, it, expect, vi } from "vitest"
import { listMonthly } from "../../../src/service/ranking-service"

describe("listMonthly", () => {
  describe("正常系", () => {
    it("対象言語のスナップショットを返す", async () => {
      const languageRepository = { findBySlug: vi.fn().mockResolvedValue({ id: 1, name: "TypeScript", slug: "typescript" }) }
      const monthlyRankingSnapshotRepository = { findTopByLanguage: vi.fn().mockResolvedValue([{ rank: 1, score: 285, accuracy: 0.95, playedAt: new Date("2026-06-10T00:00:00Z"), user: { id: 1, displayName: "alice", avatarUrl: null, currentGrade: "intern" } }]) }
      const result = await listMonthly({ language: "typescript", limit: 5 }, { languageRepository, monthlyRankingSnapshotRepository })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries).toHaveLength(1)
        expect(result.value.yearMonth).toMatch(/^\d{4}-\d{2}$/)
      }
    })
  })
  describe("異常系", () => {
    it("未対応言語は BAD_REQUEST", async () => {
      const languageRepository = { findBySlug: vi.fn().mockResolvedValue(null) }
      const monthlyRankingSnapshotRepository = { findTopByLanguage: vi.fn() }
      const result = await listMonthly({ language: "typescript" as const, limit: 5 }, { languageRepository, monthlyRankingSnapshotRepository })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.type).toBe("BAD_REQUEST")
    })
  })
})
```

Controller integration テスト（実 DB に対して）：

```ts
// apps/api/test/controller/ranking/monthly-list.test.ts
describe("GET /api/rankings/monthly", () => {
  describe("正常系", () => {
    it("200 と entries 配列を返す", async () => {
      // monthly_ranking_snapshots に当月分のレコードを INSERT
      const res = await request(app).get("/api/rankings/monthly?language=typescript&limit=5")
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        year_month: expect.stringMatching(/^\d{4}-\d{2}$/),
        entries: expect.arrayContaining([expect.objectContaining({ rank: expect.any(Number), score: expect.any(Number) })]),
      })
    })
  })
  describe("異常系", () => {
    it("language が無いと 400", async () => {
      const res = await request(app).get("/api/rankings/monthly")
      expect(res.status).toBe(400)
    })
  })
})
```

ローカルで:

```bash
cd apps/api && pnpm dev

curl 'http://localhost:8080/api/rankings/monthly?language=typescript&limit=5'
```

期待値：

- 200 + `{ year_month: "2026-06", entries: [...] }` の構造
- 言語パラメータが必須 → 未指定で 400
- limit 11 以上は 400
- 当月分のスナップショットが空のときは `entries: []`
