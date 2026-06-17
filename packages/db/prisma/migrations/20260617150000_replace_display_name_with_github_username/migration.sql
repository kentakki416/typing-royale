-- 自由入力の display_name を廃止し、 GitHub username (login) で表示を統一する。
-- 既存ユーザーには github_username は埋まらず、 次回 GitHub OAuth ログイン時に
-- authenticateWithGithub で github user info の login が書き込まれる。
ALTER TABLE "users" ADD COLUMN "github_username" TEXT;
ALTER TABLE "users" DROP COLUMN "display_name";
