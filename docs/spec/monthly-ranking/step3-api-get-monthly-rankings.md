# step3: API — GET /api/rankings/monthly

`monthly_ranking_snapshots` から当月のランキング上位 N 件を返す公開エンドポイント。

> **v2 での変更**: 旧仕様は cron が事前計算した `rank` を `ORDER BY rank ASC` で取り出していたが、新仕様では DB を `ORDER BY score DESC, accuracy DESC, played_at ASC` で並べて取り出し、**rank はアプリ側で `idx + 1` を振る** (殿堂入りと同じ設計)。

## 対応内容

### スキーマ（`packages/schema/src/api-schema/ranking.ts`）

レスポンス形式は v1 と互換性を維持 (`rank` フィールドは引き続き含めて返す)。クライアント側からは旧仕様と同じインターフェースで利用できる。

```ts
// ========================================================
// GET /api/rankings/monthly - 当月の言語別 TOP N
// ========================================================

export const getMonthlyRankingsQueryStringSchema = z.object({
  language: z.enum(["typescript", "javascript"]),
  limit: z.coerce.number().int().min(1).max(10).default(5),
})

export const monthlyRankingEntrySchema = z.object({
  accuracy: z.number().min(0).max(1),
  played_at: z.string().datetime(),
  rank: z.number().int().min(1),      /// アプリ側で算出 (idx+1)
  score: z.number().int().nonnegative(),
  user: z.object({
    avatar_url: z.string().url().nullable(),
    current_grade: z.string(),
    github_username: z.string().nullable(),
    id: z.number().int().positive(),
  }),
})

export const getMonthlyRankingsResponseSchema = z.object({
  entries: z.array(monthlyRankingEntrySchema).max(10),
  /** "YYYY-MM" 形式 (JST) */
  year_month: z.string().regex(/^\d{4}-\d{2}$/),
})

export type GetMonthlyRankingsQueryString = z.infer<typeof getMonthlyRankingsQueryStringSchema>
export type GetMonthlyRankingsResponse = z.infer<typeof getMonthlyRankingsResponseSchema>
```

### Repository（`apps/api/src/repository/prisma/monthly-ranking-snapshot-repository.ts`）

```ts
import { PrismaClient } from "@repo/db"

export type MonthlyRankingTopEntry = {
  accuracy: number
  playedAt: Date
  score: number
  user: {
    avatarUrl: string | null
    currentGrade: string
    githubUsername: string
    id: number
  }
}

export type UpsertMonthlySnapshotInput = {
  accuracy: number
  languageId: number
  playedAt: Date
  score: number
  userId: number
  yearMonth: string
}

export interface MonthlyRankingSnapshotRepository {
  /** capSize 件のうち何件が現在保存されているか */
  countByLanguage: (yearMonth: string, languageId: number) => Promise<number>
  /** TOP 10 cap 維持時の boundary score (= MIN(score)) を取得。0 件なら null */
  findBoundaryScore: (yearMonth: string, languageId: number, capSize: number) => Promise<number | null>
  /** /finish 内で自分の行を upsert */
  upsertForUser: (input: UpsertMonthlySnapshotInput, tx?: TransactionContext) => Promise<void>
  /** TOP capSize を超過したとき、自分以外の最低スコア行を delete */
  deleteLowestExcluding: (yearMonth: string, languageId: number, excludeUserId: number, tx?: TransactionContext) => Promise<void>
  findTopByLanguage: (yearMonth: string, languageId: number, limit: number) => Promise<MonthlyRankingTopEntry[]>
}
```

`findTopByLanguage` の本体は以下。`rank` は **DB に保存しないので select しない**：

```ts
findTopByLanguage = async (yearMonth, languageId, limit) => {
  const rows = await this.prisma.monthlyRankingSnapshot.findMany({
    include: {
      user: {
        include: { lifetimeStats: { select: { currentGrade: true } } },
      },
    },
    orderBy: [
      { score: "desc" },
      { accuracy: "desc" },
      { playedAt: "asc" },
    ],
    take: limit,
    where: { languageId, yearMonth },
  })
  return rows.map((row) => ({
    accuracy: row.accuracy,
    playedAt: row.playedAt,
    score: row.score,
    user: {
      avatarUrl: row.user.avatarUrl,
      currentGrade: row.user.lifetimeStats?.currentGrade ?? "intern",
      githubUsername: row.user.githubUsername ?? "anonymous",
      id: row.user.id,
    },
  }))
}
```

### Service（`apps/api/src/service/ranking-service.ts`）

```ts
export const listMonthly = async (
  input: { languageSlug: "javascript" | "typescript"; limit: number },
  repo: {
    languageRepository: LanguageRepository
    monthlyRankingSnapshotRepository: MonthlyRankingSnapshotRepository
  },
): Promise<Result<{ entries: MonthlyRankingEntryWithRank[]; yearMonth: string }>> => {
  logger.debug("RankingService: listMonthly", { languageSlug: input.languageSlug, limit: input.limit })

  const language = await repo.languageRepository.findBySlug(input.languageSlug)
  if (language === null) {
    return err(badRequestError(`Unsupported language: ${input.languageSlug}`))
  }

  /** 純関数として `new Date()` を明示的に渡す（テスト時に固定時刻を注入できる） */
  const yearMonth = currentYearMonthJst(new Date())
  const top = await repo.monthlyRankingSnapshotRepository.findTopByLanguage(
    yearMonth,
    language.id,
    input.limit,
  )

  /** rank はアプリ側で振り直す (idx + 1)。殿堂入り (RankingService.list) と同じパターン */
  const entries = top.map((entry, idx) => ({ ...entry, rank: idx + 1 }))

  return ok({ entries, yearMonth })
}
```

Controller / Router / DI は v1 と同じ (詳細省略)。

## 動作確認

```bash
cd apps/api && pnpm dev

# 当月の TS TOP 5
curl 'http://localhost:8080/api/rankings/monthly?language=typescript&limit=5'

# rank が 1, 2, 3 ... の連番で返ってくることを確認
```

期待値：

- 200 + `{ year_month: "YYYY-MM", entries: [{ rank: 1, ... }, { rank: 2, ... }, ...] }`
- rank が DB の保存値ではなく、ORDER BY 順で 1 から振られている
- 同じ score でも accuracy / played_at の tie-break で順位が決まる
- 当月分のスナップショットが空のときは `entries: []`
- 11 件以上保存されていない (TOP 10 cap が維持されている)

## Service ユニットテスト (要点)

```ts
describe("listMonthly", () => {
  describe("正常系", () => {
    it("rank が idx+1 でアプリ側で振られる (Repository は rank を返さない)", async () => {
      const monthlyRankingSnapshotRepository = {
        findTopByLanguage: vi.fn().mockResolvedValue([
          { score: 600, accuracy: 0.95, playedAt: new Date(), user: {...} },
          { score: 500, accuracy: 0.93, playedAt: new Date(), user: {...} },
        ]),
        // 他のメソッドは listMonthly では未使用
      }
      const result = await listMonthly({ language: "typescript", limit: 5 }, { languageRepository, monthlyRankingSnapshotRepository })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries[0].rank).toBe(1)
        expect(result.value.entries[1].rank).toBe(2)
      }
    })
  })
})
```
