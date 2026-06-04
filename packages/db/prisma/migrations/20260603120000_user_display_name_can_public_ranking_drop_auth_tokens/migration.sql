-- users.name → users.display_name にリネーム
ALTER TABLE "users" RENAME COLUMN "name" TO "display_name";

-- users.can_public_ranking 追加（既存ユーザーは既定で true）
ALTER TABLE "users" ADD COLUMN "can_public_ranking" BOOLEAN NOT NULL DEFAULT true;

-- auth_accounts からアクセストークン系カラムを削除
-- （OAuth トークンは本アプリでは保持しない方針: docs/spec/github-auth/README.md）
ALTER TABLE "auth_accounts" DROP COLUMN "access_token";
ALTER TABLE "auth_accounts" DROP COLUMN "refresh_token";
ALTER TABLE "auth_accounts" DROP COLUMN "expires_at";
ALTER TABLE "auth_accounts" DROP COLUMN "token_type";
ALTER TABLE "auth_accounts" DROP COLUMN "scope";
ALTER TABLE "auth_accounts" DROP COLUMN "id_token";

-- 旧 Provider Enum は schema.prisma から削除済み（モデルでは文字列で扱う）
DROP TYPE IF EXISTS "Provider";
