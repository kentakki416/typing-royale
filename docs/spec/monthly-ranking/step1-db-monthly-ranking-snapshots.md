# step1: DB — `monthly_ranking_snapshots` テーブル

`/finish` が同期書き込みする月間ランキング用のフラットなスナップショットテーブル。**TOP 10 cap** を `/finish` で維持するため、`(年月, 言語)` ごとに最大 10 行に抑える。月変わりで前月のデータは消さず履歴として残す。

> **v2 での変更**: 旧仕様にあった `rank` カラムを **削除**。順位はクエリ時計算（殿堂入りと同じ設計、`ORDER BY score DESC, accuracy DESC, played_at ASC` + アプリ側で `idx+1`）で扱う。cron を廃止し書き込みは `/finish` のみ。

## 対応内容

### Prisma スキーマ（`packages/db/prisma/schema.prisma`）

```prisma
model MonthlyRankingSnapshot {
  yearMonth  String   @map("year_month")  /// "YYYY-MM" 形式 (JST 暦月)
  languageId Int      @map("language_id")
  userId     Int      @map("user_id")
  score      Int                            /// その月のベストスコア
  accuracy   Float                          /// 上記スコア時の正確率
  playedAt   DateTime @map("played_at")     /// 上記スコア時の played_at（tie-breaking 用に保存）
  snapshotAt DateTime @default(now()) @map("snapshot_at") /// 行を書き込んだ時刻

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  language Language @relation(fields: [languageId], references: [id], onDelete: Restrict)

  @@id([yearMonth, languageId, userId])
  @@index([yearMonth, languageId, score(sort: Desc)]) /// TOP 10 取得・boundary 算出用
  @@map("monthly_ranking_snapshots")
}
```

`User` / `Language` モデルの逆方向リレーションは既存のまま維持。

### Migration (v1 からの差分)

旧 schema には `rank int` カラムと `(year_month, language_id, rank)` index が存在する。新 schema との差分を migration で適用する：

```sql
-- rank カラム削除
ALTER TABLE "monthly_ranking_snapshots" DROP COLUMN "rank";

-- 旧 index 削除
DROP INDEX "monthly_ranking_snapshots_year_month_language_id_rank_idx";

-- 新 index 作成 (score DESC 順)
CREATE INDEX "monthly_ranking_snapshots_year_month_language_id_score_idx"
  ON "monthly_ranking_snapshots" ("year_month", "language_id", "score" DESC);
```

`pnpm --filter @repo/db prisma migrate dev --name drop_rank_from_monthly_ranking_snapshots` で生成する。

### 設計判断メモ

- **`rank` カラムを削除した理由**: `/finish` で自分の行を upsert する設計に変えたため、他ユーザーの行を update する必要をなくしたい。`rank` を保存しないことで「自分が 5 位に入ったら元 5 位の行を update して 6 位にする」処理が不要になり、tx 内で触る行が「自分の 1 行 + 押し出された 1 行 (delete)」に最小化される
- **`(year_month, language_id, score DESC)` index に切替**: ORDER BY score DESC LIMIT 10 を index range scan で取れる。TOP 10 cap 維持時の boundary score 取得 (MIN(score) WHERE …) も同 index で軽量
- **PK は `(year_month, language_id, user_id)` のまま**: 自分の行を upsert (ON CONFLICT) する際の一意性に必要
- **`snapshot_at` を残す**: 「行が最後に書き込まれた時刻」のデバッグ・参照用。表示には未使用

## 動作確認

```bash
# マイグレーション
cd packages/db && pnpm prisma migrate dev --name drop_rank_from_monthly_ranking_snapshots

# テーブル構造確認
docker exec typing-royale-postgres psql -U postgres -d typing_royale_dev -c "\d monthly_ranking_snapshots"

# index 確認 (新 index の存在 + 旧 index の不在)
docker exec typing-royale-postgres psql -U postgres -d typing_royale_dev -c "\di monthly_ranking_snapshots*"
```

期待値：

- `rank` カラムが存在しない
- 新 index `monthly_ranking_snapshots_year_month_language_id_score_idx` が存在
- 旧 index `..._rank_idx` が存在しない
- PK / FK は変更なし
