# step1: rewards テーブル拡張（special-badges 用）

既存 `rewards` テーブルに `hall_of_fame_in` / `monthly_top_ten` の 2 種を追加し、`assetSvgUrl` カラムを新設、部分インデックスのユニーク制約を張る。

## 対応内容

### `packages/db/prisma/schema.prisma`

```prisma
model Reward {
  id           Int      @id @default(autoincrement())
  userId       Int      @map("user_id")
  type         String   /// "grade_up" | "hall_of_fame_in" | "monthly_top_ten"
  payload      Json     /// 構造は type ごとに異なる（README 参照）
  assetUrl     String?  @map("asset_url")     /// PNG の S3 URL。pending 中は null
  assetSvgUrl  String?  @map("asset_svg_url") /// SVG 文字列 or CDN URL。pending 中は null
  grantedAt    DateTime @default(now()) @map("granted_at")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("rewards")
}
```

### マイグレーション SQL（手動追記）

Prisma は部分インデックスを宣言的に書けないので、`prisma migrate diff` で生成した SQL に手動追記する。

```sql
-- ALTER は prisma 自動生成
ALTER TABLE "rewards" ADD COLUMN "asset_svg_url" TEXT;
ALTER TABLE "rewards" ALTER COLUMN "asset_url" DROP NOT NULL;

-- 部分インデックス（手動追記）
CREATE UNIQUE INDEX "rewards_hof_unique"
  ON "rewards"(user_id, type, (payload->>'language'))
  WHERE type = 'hall_of_fame_in';

CREATE UNIQUE INDEX "rewards_monthly_unique"
  ON "rewards"(user_id, type, (payload->>'language'), (payload->>'year_month'))
  WHERE type = 'monthly_top_ten';
```

### Domain 型

`apps/api/src/types/domain/reward.ts` を新規 or 既存に追記:

```typescript
export type RewardType = "grade_up" | "hall_of_fame_in" | "monthly_top_ten"

export type GradeUpPayload = { grade_slug: string }
export type HallOfFameInPayload = { language: "typescript" | "javascript", rank: number }
export type MonthlyTopTenPayload = {
  language: "typescript" | "javascript",
  rank: number,
  year_month: string  // "2026-06"
}

export type RewardPayload = GradeUpPayload | HallOfFameInPayload | MonthlyTopTenPayload

export type Reward = {
  id: number
  userId: number
  type: RewardType
  payload: RewardPayload
  assetUrl: string | null
  assetSvgUrl: string | null
  grantedAt: Date
  createdAt: Date
  updatedAt: Date
}
```

## 動作確認

```bash
cd packages/db && pnpm db:migrate:dev --name add_special_badges_to_rewards

# マイグレーション後の確認
psql $DATABASE_URL -c "\d rewards"
# → asset_svg_url カラムが存在し、asset_url が nullable になっていること
# → rewards_hof_unique / rewards_monthly_unique の部分インデックスが存在すること

# ユニーク制約の動作確認
psql $DATABASE_URL -c "
  INSERT INTO rewards (user_id, type, payload, granted_at, created_at, updated_at)
  VALUES (1, 'hall_of_fame_in', '{\"language\":\"typescript\",\"rank\":3}'::jsonb, NOW(), NOW(), NOW());
"
psql $DATABASE_URL -c "
  INSERT INTO rewards (user_id, type, payload, granted_at, created_at, updated_at)
  VALUES (1, 'hall_of_fame_in', '{\"language\":\"typescript\",\"rank\":1}'::jsonb, NOW(), NOW(), NOW());
"
# → 2 つ目は unique violation で失敗する（同じ userId × type × language）
```
