-- マスタデータ: 問題プールが扱う言語マスタ。
-- apps/cron のクローラが slug を GitHub Search API の language: フィルタに渡すため、
-- production を含む全環境で必要。seed スクリプトではなく migration で管理することで
-- migrate deploy（既存 deploy pipeline）に乗せ、自動・冪等・バージョン管理する。
-- ON CONFLICT DO NOTHING で冪等なので、何度 migrate deploy を流しても安全。
INSERT INTO "languages" ("name", "slug", "created_at", "updated_at")
VALUES
  ('TypeScript', 'typescript', NOW(), NOW()),
  ('JavaScript', 'javascript', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
