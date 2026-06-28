# step1: 言語マスタへ Go 行を追加する migration

`languages` テーブルに Go 行（`name="Go"`, `slug="go"`）を追加する。既存の seed migration と同じく **migration で冪等に投入**する（seed スクリプトではなく migration に乗せることで `migrate deploy` パイプラインに自動で乗る）。

## 対応内容

### `packages/db/prisma/migrations/<timestamp>_add_go_language/migration.sql`（新規）

`20260626120000_seed_master_languages/migration.sql` と同じ書式：

```sql
-- マスタデータ: 問題プールが扱う言語マスタに Go を追加する。
-- apps/cron の Go クローラが slug "go" を GitHub Search API の language: フィルタに渡すため、
-- production を含む全環境で必要。ON CONFLICT DO NOTHING で冪等。
INSERT INTO "languages" ("name", "slug", "created_at", "updated_at")
VALUES ('Go', 'go', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
```

> Prisma schema（`packages/db/prisma/schema.prisma`）の `Language` モデルは変更不要（行の追加のみでカラム構成は不変）。`prisma migrate dev` ではなく、既存スタイルに合わせて **手書きの SQL migration ディレクトリ**を追加する。

## 動作確認

```bash
cd apps/api && pnpm db:migrate

# Go 行が入ったことを確認
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "
  SELECT id, name, slug FROM languages ORDER BY id;"
```

期待結果：`typescript` / `javascript` に続いて `go` 行が 1 行存在する。再度 `pnpm db:migrate` を流しても `ON CONFLICT DO NOTHING` で重複しない（冪等）。
</content>
