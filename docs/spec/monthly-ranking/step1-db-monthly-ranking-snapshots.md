# step1: DB — monthly_ranking_snapshots テーブル

毎時バッチが書き込み、API が読むだけのフラットな集計テーブル。月変わりで前月のデータは消さず履歴として残す。

## 対応内容

### Prisma スキーマ（`packages/db/prisma/schema.prisma` に追加）

```prisma
model MonthlyRankingSnapshot {
  yearMonth  String   @map("year_month")  /// "YYYY-MM" 形式 (JST 暦月)
  languageId Int      @map("language_id")
  userId     Int      @map("user_id")
  rank       Int                            /// 1 起点、tie-breaking 後の最終順位
  score      Int                            /// その月のベストスコア
  accuracy   Float                          /// 上記スコア時の正確率
  playedAt   DateTime @map("played_at")     /// 上記スコア時の played_at（tie-breaking 用に保存）
  snapshotAt DateTime @default(now()) @map("snapshot_at") /// バッチが書き込んだ時刻

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  language Language @relation(fields: [languageId], references: [id], onDelete: Restrict)

  @@id([yearMonth, languageId, userId])
  @@index([yearMonth, languageId, rank])      // ホーム画面用 SELECT の主索引
  @@map("monthly_ranking_snapshots")
}
```

`User` / `Language` モデルにも逆方向のリレーション 1 行を追加（既存パターン踏襲）：

```prisma
model User {
  // 既存フィールド ...
  monthlyRankingSnapshots MonthlyRankingSnapshot[]
}

model Language {
  // 既存フィールド ...
  monthlyRankingSnapshots MonthlyRankingSnapshot[]
}
```

### Migration

`pnpm --filter @repo/db prisma migrate dev --name add_monthly_ranking_snapshots` で生成。SQL の骨子：

```sql
CREATE TABLE "monthly_ranking_snapshots" (
  "year_month"  text NOT NULL,
  "language_id" integer NOT NULL,
  "user_id"     integer NOT NULL,
  "rank"        integer NOT NULL,
  "score"       integer NOT NULL,
  "accuracy"    double precision NOT NULL,
  "played_at"   timestamp(3) without time zone NOT NULL,
  "snapshot_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("year_month", "language_id", "user_id"),
  CONSTRAINT "monthly_ranking_snapshots_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "monthly_ranking_snapshots_language_id_fkey"
    FOREIGN KEY ("language_id") REFERENCES "languages"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX "monthly_ranking_snapshots_year_month_language_id_rank_idx"
  ON "monthly_ranking_snapshots" ("year_month", "language_id", "rank");
```

### 設計判断メモ

- **PK が `(year_month, language_id, user_id)`** ：UPSERT で「同じ月×言語×ユーザー」の重複更新を一意にするため。`rank` は値として持つ（変動するので PK には入れない）
- **`played_at` を持つ理由**：tie-breaking のキーとして表示時に再現可能にする。score-ranking と同じ
- **`snapshot_at` を持つ理由**：将来「○時間前に更新」のような表示が必要になったとき用。MVP では使わなくても列だけ用意
- **PK で `rank` を含めない**：rank は集計結果でしかなく、同月内で順位が変動するため

## 動作確認

```bash
# マイグレーション
cd packages/db && pnpm prisma migrate dev --name add_monthly_ranking_snapshots

# テーブルが作られていること
docker exec typing-royale-postgres psql -U postgres -d typing_royale_dev -c "\d monthly_ranking_snapshots"

# index も含めて確認
docker exec typing-royale-postgres psql -U postgres -d typing_royale_dev -c "\di monthly_ranking_snapshots*"
```

期待値：

- カラムが Prisma スキーマの定義通り
- PK が `(year_month, language_id, user_id)`
- index `monthly_ranking_snapshots_year_month_language_id_rank_idx` が存在
- 外部キーが `users.id` / `languages.id` に張られている
