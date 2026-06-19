# step2: rewards テーブルに generation_status カラム追加

worker 化に伴い、reward の生成ステータスを永続化するカラムを `rewards` テーブルに追加する。失敗状態を将来再生成する際の起点になる。

## 対応内容

### Prisma schema 修正

`packages/db/prisma/schema.prisma`:

```prisma
model Reward {
  id                Int      @id @default(autoincrement())
  userId            Int      @map("user_id")
  type              String   /// "grade_up" | "hall_of_fame_in" | "monthly_top_ten"
  payload           Json
  assetUrl          String?  @map("asset_url")     /// pending 中は null
  assetSvgUrl       String?  @map("asset_svg_url") /// pending 中は null
  generationStatus  String   @default("pending") @map("generation_status")
  /// "pending" | "processing" | "completed" | "failed"
  /// step3 で worker がステート遷移を管理する。step4 で UI 側は completed のみ表示
  grantedAt         DateTime @map("granted_at")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, grantedAt(sort: Desc)])
  @@index([userId, generationStatus, grantedAt(sort: Desc)]) /// step4 のホーム見逃し popup 取得用
  @@map("rewards")
}
```

### マイグレーション SQL

`packages/db/prisma/migrations/20260619000000_add_rewards_generation_status/migration.sql`:

```sql
-- step1-3 で実装される worker 化に伴い、生成ステータスを永続化する
ALTER TABLE "rewards"
  ADD COLUMN "generation_status" TEXT NOT NULL DEFAULT 'pending';

-- 既存行 (本番に既に存在する grade_up カード) は asset_url が埋まっているので
-- completed として扱う。これで step4 の見逃し popup 判定でも正しく動作する
UPDATE "rewards"
  SET "generation_status" = 'completed'
  WHERE "asset_url" IS NOT NULL;

-- step4 でホーム画面が「直近 7 日 + completed」を SELECT するためのインデックス
CREATE INDEX "rewards_user_id_generation_status_granted_at_idx"
  ON "rewards" ("user_id", "generation_status", "granted_at" DESC);
```

### Domain 型の追加

`apps/api/src/types/domain/reward.ts`:

```typescript
export type RewardGenerationStatus =
    | "completed"
    | "failed"
    | "pending"
    | "processing"

export type Reward = {
    id: number
    userId: number
    type: RewardType
    payload: RewardPayload
    assetUrl: string | null
    assetSvgUrl: string | null
    generationStatus: RewardGenerationStatus
    grantedAt: Date
    createdAt: Date
    updatedAt: Date
}
```

### Repository / Service の整合

#### `apps/api/src/repository/prisma/reward-repository.ts`

`RewardRow` 型に `generationStatus` を追加。`_toRow` で復元。新しいメソッドを追加:

```typescript
export interface RewardRepository {
    // ... 既存 ...

    /** step4 のホーム見逃し popup 用: 直近 N 日かつ completed の reward を取得 */
    findRecentCompletedByUserId(userId: number, sinceDays: number): Promise<RewardRow[]>

    /** step3 の worker から呼ぶ: ステータスのみ更新 */
    updateGenerationStatus(id: number, status: RewardGenerationStatus): Promise<void>
}
```

### スキーマ層

`packages/schema/src/api-schema/rewards.ts` の `rewardEntrySchema` に `generation_status` を追加:

```typescript
const rewardEntrySchema = z.object({
  asset_svg_url: z.string().nullable(),
  asset_url: z.string().nullable(),
  generation_status: z.enum(["completed", "failed", "pending", "processing"]),
  granted_at: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
  reward_id: z.number().int().positive(),
  type: z.string(),
})
```

### Controller のレスポンス対応

`apps/api/src/controller/rewards/me.ts` で `generation_status` をレスポンスに含める:

```typescript
rewards: rewards.map((r) => ({
  asset_svg_url: r.assetSvgUrl,
  asset_url: r.assetUrl,
  generation_status: r.generationStatus,
  granted_at: r.grantedAt.toISOString(),
  payload: r.payload,
  reward_id: r.id,
  type: r.type,
}))
```

## 動作確認

```bash
cd packages/db && pnpm db:migrate:dev --name add_rewards_generation_status

# DB 確認
psql $DATABASE_URL -c "\d rewards"
# → generation_status カラムが存在
# → rewards_user_id_generation_status_granted_at_idx が存在

# 既存行のステータス確認
psql $DATABASE_URL -c "
  SELECT generation_status, COUNT(*)
  FROM rewards
  GROUP BY generation_status;
"
# → 既存の asset_url 入り行は completed、それ以外は pending
```

ユニットテスト (Repository 単体テストの mock 拡張):

```typescript
describe("findRecentCompletedByUserId", () => {
  describe("正常系", () => {
    it("直近 7 日かつ completed の reward を granted_at DESC で返す", async () => {
      // ...
    })
    it("pending / processing / failed は除外する", async () => {
      // ...
    })
    it("8 日以上前の completed は除外する", async () => {
      // ...
    })
  })
})
```
