# step1: API — `/finish` レスポンスに月間 TOP 10 boundary を追加 + snapshot 同期 UPSERT

`POST /api/play-sessions/[id]/finish` の処理に「月間 snapshot 同期 UPSERT + boundary 算出」を追加し、レスポンスに `monthly_top_ten_boundary_score` を含める。

## 対応内容

### 1. Schema (`packages/schema/src/api-schema/play-session.ts`)

```ts
export const finishPlaySessionResponseSchema = z.object({
  // 既存フィールド全て維持 ...
  top_ten_boundary_score: z.number().int().nonnegative().nullable(),
  /**
   * 月間 TOP 10 の boundary score (= 当月 cap 内の最低 score)。
   * 当月 snapshot が 10 件未満なら null (= 誰でも入賞判定対象)。
   * フロント側で `result.score >= monthly_top_ten_boundary_score || === null` で月間入賞判定する
   */
  monthly_top_ten_boundary_score: z.number().int().nonnegative().nullable(),
})
```

`FinishGuestPlaySessionResponse` には **追加しない** (ゲストは対象外)。

スキーマ build:
```bash
cd packages/schema && pnpm build
```

### 2. Repository (`apps/api/src/repository/prisma/monthly-ranking-snapshot-repository.ts`)

[`monthly-ranking step3`](../monthly-ranking/step3-api-get-monthly-rankings.md) で定義した interface に書き込み系メソッドを追加:

```ts
export interface MonthlyRankingSnapshotRepository {
  findTopByLanguage: ...  // 既存
  findBoundaryScore: (yearMonth: string, languageId: number, capSize: number) => Promise<number | null>
  upsertForUser: (input: { yearMonth, languageId, userId, score, accuracy, playedAt }, tx?: TransactionContext) => Promise<void>
  deleteLowestExcluding: (yearMonth, languageId, excludeUserId, tx?: TransactionContext) => Promise<void>
  countByLanguage: (yearMonth, languageId) => Promise<number>
}
```

実装の要点:

```ts
findBoundaryScore = async (yearMonth, languageId, capSize) => {
  const rows = await this.prisma.monthlyRankingSnapshot.findMany({
    select: { score: true },
    where: { yearMonth, languageId },
    orderBy: [{ score: "desc" }, { accuracy: "desc" }, { playedAt: "asc" }],
    take: capSize,
  })
  if (rows.length < capSize) return null
  return rows[rows.length - 1].score
}

upsertForUser = async (input, tx) => {
  const client = tx ?? this.prisma
  await client.monthlyRankingSnapshot.upsert({
    where: {
      yearMonth_languageId_userId: {
        yearMonth: input.yearMonth,
        languageId: input.languageId,
        userId: input.userId,
      },
    },
    update: { score: input.score, accuracy: input.accuracy, playedAt: input.playedAt },
    create: { ...input },
  })
}

deleteLowestExcluding = async (yearMonth, languageId, excludeUserId, tx) => {
  const client = tx ?? this.prisma
  /** 自分以外で score / accuracy / playedAt の最下位を 1 件削除 */
  const lowest = await client.monthlyRankingSnapshot.findFirst({
    where: { yearMonth, languageId, NOT: { userId: excludeUserId } },
    orderBy: [{ score: "asc" }, { accuracy: "asc" }, { playedAt: "desc" }],
    select: { userId: true },
  })
  if (lowest === null) return
  await client.monthlyRankingSnapshot.delete({
    where: {
      yearMonth_languageId_userId: {
        yearMonth, languageId, userId: lowest.userId,
      },
    },
  })
}
```

### 3. Service (`apps/api/src/service/play-session-service.ts`)

`finishSession` の既存集計フローに月間 snapshot 同期と boundary 取得を追加:

```ts
// 既存 transaction で 5 テーブル書き込み済みの直後 ...
const topTenBoundaryScore = await repo.userLanguageBestRepository.findTenthScore(state.languageId)

// 新規: 月間 snapshot 同期 UPSERT + boundary 算出
const yearMonth = currentYearMonthJst()  // "YYYY-MM" (JST)
const myMonthlyBestScore = ... // 当月内の自分のベストか今回のスコア (= 今回が上書きするなら今回値)

const beforeCount = await repo.monthlyRankingSnapshotRepository.countByLanguage(yearMonth, state.languageId)
const beforeBoundary = beforeCount < 10
  ? null
  : await repo.monthlyRankingSnapshotRepository.findBoundaryScore(yearMonth, state.languageId, 10)

const isMonthlyTopTenEntry = beforeCount < 10 || myMonthlyBestScore >= (beforeBoundary ?? 0)

if (isMonthlyTopTenEntry) {
  await repo.monthlyRankingSnapshotRepository.upsertForUser({
    yearMonth, languageId: state.languageId, userId: state.userId,
    score: myMonthlyBestScore, accuracy, playedAt,
  })
  /** TOP 10 cap 維持: 11 件以上になっていれば自分以外の最低スコア行を delete */
  const afterCount = await repo.monthlyRankingSnapshotRepository.countByLanguage(yearMonth, state.languageId)
  if (afterCount > 10) {
    await repo.monthlyRankingSnapshotRepository.deleteLowestExcluding(yearMonth, state.languageId, state.userId)
  }
}

/** レスポンスには「現在の」boundary を返す (自分の upsert 反映後の値) */
const monthlyTopTenBoundaryScore = await repo.monthlyRankingSnapshotRepository.findBoundaryScore(
  yearMonth, state.languageId, 10,
)

return ok({
  // 既存 ...
  topTenBoundaryScore,
  monthlyTopTenBoundaryScore,
})
```

### 4. Controller (`apps/api/src/controller/play-session/finish.ts`)

レスポンス build に `monthly_top_ten_boundary_score` を追加:

```ts
const response = parseResponse(finishPlaySessionResponseSchema, {
  // 既存 ...
  top_ten_boundary_score: result.value.topTenBoundaryScore,
  monthly_top_ten_boundary_score: result.value.monthlyTopTenBoundaryScore,  // 追加
})
```

## 動作確認

### Service ユニットテスト

```ts
describe("finishSession (月間 TOP 10 入賞)", () => {
  describe("正常系", () => {
    it("当月 snapshot が 10 件未満なら誰でも入賞、boundary=null", async () => {
      mockCountByLanguage.mockResolvedValue(5)  // before
      // ... 各 mock を順に
      const result = await finishSession(input, repo)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.monthlyTopTenBoundaryScore).toBeNull()
      }
    })

    it("自分が boundary 超で入賞 → upsert + cap 維持 delete が走る", async () => {
      mockCountByLanguage.mockResolvedValueOnce(10).mockResolvedValueOnce(11)
      mockFindBoundaryScore.mockResolvedValueOnce(100)  // before
      // 自分の score = 200
      const result = await finishSession({...input, accuracy: 1, ...}, repo)
      expect(mockUpsertForUser).toHaveBeenCalledTimes(1)
      expect(mockDeleteLowestExcluding).toHaveBeenCalledTimes(1)
    })

    it("自分が boundary 未満で入賞しない → upsert / delete どちらも呼ばれない", async () => {
      mockCountByLanguage.mockResolvedValue(10)
      mockFindBoundaryScore.mockResolvedValue(100)  // before
      // 自分の score = 50
      const result = await finishSession({...input, ...}, repo)
      expect(mockUpsertForUser).not.toHaveBeenCalled()
      expect(mockDeleteLowestExcluding).not.toHaveBeenCalled()
    })
  })
})
```

### Controller integration テスト

```ts
describe("POST /api/play-sessions/[id]/finish (月間 boundary)", () => {
  describe("正常系", () => {
    it("レスポンスに monthly_top_ten_boundary_score が含まれる", async () => {
      // ... ログイン user で finish
      const res = await request(app).post(`/api/play-sessions/${sessionId}/finish`).send(body)
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        top_ten_boundary_score: expect.toBeOneOf([null, expect.any(Number)]),
        monthly_top_ten_boundary_score: expect.toBeOneOf([null, expect.any(Number)]),
      })
    })

    it("当月 snapshot が空の状態で finish → snapshot に行が挿入される", async () => {
      await testPrisma.monthlyRankingSnapshot.deleteMany({ where: { yearMonth: currentYM } })
      const res = await request(app).post(...).send(body)
      expect(res.status).toBe(200)
      const rows = await testPrisma.monthlyRankingSnapshot.findMany({ where: { yearMonth: currentYM, userId: user.id } })
      expect(rows).toHaveLength(1)
    })

    it("当月 10 件で boundary < 自分なら自分が入り、最下位 1 件が消える (cap 維持)", async () => {
      // monthly_ranking_snapshots に 10 件 (自分以外、score 50-100) を seed
      // ...
      const res = await request(app).post(...).send({ score: 200, ... })
      expect(res.status).toBe(200)
      const count = await testPrisma.monthlyRankingSnapshot.count({ where: { yearMonth: currentYM } })
      expect(count).toBe(10)  // cap 維持
      // 自分の行は存在
      // score=50 の行は消えている
    })
  })
})
```

期待値:

- `monthly_top_ten_boundary_score` が `null` (10 件未満) または `number` (10 位 score) でレスポンスに含まれる
- 入賞時に `monthly_ranking_snapshots` に自分の行が upsert される
- 11 件以上になったら自分以外の最低スコア 1 行が delete される (cap 維持)
- 既存テスト (殿堂入り判定 / score 計算) は全 PASS のまま
