# step2: 冪等な reward 生成 API + 自己修復ロジック

`POST /api/rewards/generate` を新設。冪等で、同じキー（`userId × type × language × year_month?`）で再リクエストされても重複生成しない。`/finish` 完了時と次回ログイン時に未生成 pending 行を検出して自動補完する自己修復も組み込む。

## 対応内容

### スキーマ（`packages/schema/src/api-schema/rewards.ts`）

```typescript
export const generateRewardRequestSchema = z.discriminatedUnion("type", [
  z.object({
    language: z.enum(["typescript", "javascript"]),
    rank: z.number().int().min(1).max(10),
    type: z.literal("hall_of_fame_in"),
  }),
  z.object({
    language: z.enum(["typescript", "javascript"]),
    rank: z.number().int().min(1).max(10),
    type: z.literal("monthly_top_ten"),
    year_month: z.string().regex(/^\d{4}-\d{2}$/),  // "2026-06"
  }),
])

export const rewardSchema = z.object({
  asset_svg_url: z.string().nullable(),
  asset_url: z.string().nullable(),
  granted_at: z.string(),
  id: z.number().int(),
  payload: z.record(z.string(), z.unknown()),
  type: z.enum(["grade_up", "hall_of_fame_in", "monthly_top_ten"]),
})

export const generateRewardResponseSchema = rewardSchema

export const getMyRewardsQueryStringSchema = z.object({
  ids: z.string().optional(),  // "1,2,3" → [1, 2, 3]
})

export const getMyRewardsResponseSchema = z.object({
  rewards: z.array(rewardSchema),
})
```

### Service（`apps/api/src/service/rewards-service.ts` 拡張）

```typescript
export const generateReward = async (
  userId: number,
  input: GenerateRewardInput,
  repo: { rewardRepository: RewardRepository },
  deps: { cardStorage: CardStorage }
): Promise<Result<Reward>> => {
  logger.debug("generateReward: start", { type: input.type, userId })

  /** 冪等性チェック: 既存の pending or 完成行を検索 */
  const existing = await repo.rewardRepository.findByKey(userId, input)
  if (existing && existing.assetUrl !== null && existing.assetSvgUrl !== null) {
    /** rank が同じなら既存をそのまま返す */
    if ((existing.payload as { rank: number }).rank === input.rank) {
      return ok(existing)
    }
    /** rank が変わっている → 再生成して上書き */
  }

  /** SVG + PNG を生成 */
  const svg = input.type === "hall_of_fame_in"
    ? buildHofBadgeSvg({ language: input.language, rank: input.rank, username })
    : buildMonthlyBadgeSvg({ language: input.language, rank: input.rank, username, yearMonth: input.year_month })

  const png = input.type === "hall_of_fame_in"
    ? await renderHallOfFameCard({ language: input.language, rank: input.rank, username })
    : await renderMonthlyTopTenCard({ language: input.language, rank: input.rank, username, yearMonth: input.year_month })

  const pngUrl = await deps.cardStorage.save(`rewards/${userId}/${input.type}-${input.language}-${input.year_month ?? "all"}.png`, png)

  /** upsert（pending 行があれば更新、無ければ insert） */
  const reward = await repo.rewardRepository.upsertByKey(userId, input, {
    assetSvgUrl: svg,
    assetUrl: pngUrl,
    payload: input,
  })

  return ok(reward)
}

/** /finish 完了時 + ログイン時に呼ぶ自己修復 */
export const reconcilePendingRewards = async (
  userId: number,
  repo: { rewardRepository: RewardRepository },
  deps: { cardStorage: CardStorage }
): Promise<void> => {
  const pendings = await repo.rewardRepository.findPendingByUserId(userId)
  for (const p of pendings) {
    try {
      await generateReward(userId, p.payload as GenerateRewardInput, repo, deps)
    } catch (err) {
      /** 1 件失敗しても他は続行（次回ログインで再試行される） */
      logger.warn("reconcilePendingRewards: generation failed", { err, rewardId: p.id })
    }
  }
}
```

### Controller（`apps/api/src/controller/rewards/generate.ts` 新規）

```typescript
export class RewardsGenerateController {
  constructor(
    private rewardRepository: RewardRepository,
    private cardStorage: CardStorage,
  ) {}

  async execute(req: Request, res: Response) {
    const userId = req.userId!  // PROTECTED_PATHS で保証
    const body = parseRequest(generateRewardRequestSchema, req.body)

    const result = await service.rewards.generateReward(
      userId,
      body,
      { rewardRepository: this.rewardRepository },
      { cardStorage: this.cardStorage },
    )
    if (!result.ok) return sendError(req, res, result.error)

    const response = parseResponse(generateRewardResponseSchema, _toResponse(result.value))
    return res.status(200).json(response)
  }
}
```

### Repository 拡張

```typescript
interface RewardRepository {
  /** 既存 */
  findByUserId(userId: number): Promise<Reward[]>
  create(input: CreateRewardInput): Promise<Reward>

  /** 新規 */
  findByKey(userId: number, key: GenerateRewardInput): Promise<Reward | null>
  upsertByKey(userId: number, key: GenerateRewardInput, asset: { assetSvgUrl: string, assetUrl: string, payload: object }): Promise<Reward>
  findPendingByUserId(userId: number): Promise<Reward[]>  // assetUrl IS NULL
  findByIds(userId: number, ids: number[]): Promise<Reward[]>
}
```

### `/finish` と auth callback への組み込み

- `apps/api/src/service/play-session-service.ts` の `finishSession` 末尾で `await reconcilePendingRewards(userId, ...)` を **try/catch でラップ**（生成失敗で /finish 全体を失敗させない）
- `apps/api/src/service/auth-service.ts` の `authenticateWithGithub` 末尾で同上

### `/finish` レスポンスへの `pending_rewards` 追加

```typescript
/** finishPlaySessionResponseSchema に追加 */
pending_rewards: z.array(z.object({
  language: z.enum(["typescript", "javascript"]),
  rank: z.number().int(),
  type: z.enum(["hall_of_fame_in", "monthly_top_ten"]),
  year_month: z.string().optional(),
})).optional(),
```

Service 層で `rewards` テーブルに pending 行を INSERT したあと、そのキー情報をレスポンスに詰める。

## 動作確認

### ユニットテスト（`apps/api/test/service/rewards-service/generate-reward.test.ts`）

```typescript
describe("generateReward", () => {
  describe("正常系", () => {
    it("初回リクエストで pending 行が生成され assetUrl / assetSvgUrl が埋まる", async () => { /* ... */ })
    it("同じ rank で再リクエストすると既存をそのまま返す（再生成しない）", async () => { /* ... */ })
    it("rank が変わったら既存行を upsert で上書きする", async () => { /* ... */ })
  })
  describe("異常系", () => {
    it("不正な type で 400 を返す（discriminatedUnion でリジェクト）", async () => { /* ... */ })
    it("S3 アップロード失敗時に throw する（自己修復で次回再試行される）", async () => { /* ... */ })
  })
})
```

### インテグレーションテスト（`apps/api/test/controller/rewards/generate.test.ts`）

```typescript
describe("POST /api/rewards/generate", () => {
  describe("正常系", () => {
    it("hall_of_fame_in で 200 と reward を返す、DB に行が作成される", async () => { /* ... */ })
    it("monthly_top_ten で 200 と reward を返す", async () => { /* ... */ })
    it("二重リクエストで重複行が作成されない（冪等）", async () => { /* ... */ })
  })
  describe("異常系", () => {
    it("認証なしで 401", async () => { /* ... */ })
    it("rank=0 で 400", async () => { /* ... */ })
  })
})
```
