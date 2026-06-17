import { z } from "zod"

/**
 * 認証フロー（GitHub OAuth）のレスポンスに含める user オブジェクト
 *
 * - github_username: GitHub OAuth ログインで取得した username。 表示は `@<username>`
 * - can_public_ranking: false でランキング集計対象から完全除外（順位そのものを計算しない）
 *
 * GET/PATCH /api/user のスキーマと同形だが、依存方向を user.ts → auth.ts にしないため
 * 重複定義（互換性が必要になれば共通ファイルに切り出す）。
 */
const authUserSchema = z.object({
  avatar_url: z.string().nullable(),
  can_public_ranking: z.boolean(),
  created_at: z.string(),
  email: z.string().nullable(),
  github_username: z.string().nullable(),
  id: z.number(),
})

// ========================================================
// POST /api/auth/github - GitHub OAuth 認証コードの検証
// ========================================================

/**
 * GitHub OAuth 認証リクエストのスキーマ
 *
 * Web (Next.js) 側で取得した Authorization Code と、callback URL の redirect_uri を受け取る。
 * API 側で code → access_token 交換 → GitHub /user 取得 → User+AuthAccount upsert を行う。
 */
export const authGithubRequestSchema = z.object({
  code: z.string().min(1),
  redirect_uri: z.string().url(),
})

export type AuthGithubRequest = z.infer<typeof authGithubRequestSchema>

/**
 * GitHub OAuth 認証レスポンスのスキーマ
 *
 * Web 側で setAuthCookies に渡してログイン状態を確立する。
 */
export const authGithubResponseSchema = z.object({
  access_token: z.string(),
  is_new_user: z.boolean(),
  refresh_token: z.string(),
  user: authUserSchema,
})

export type AuthGithubResponse = z.infer<typeof authGithubResponseSchema>

// ========================================================
// POST /api/auth/refresh - Access/Refresh Token のローテーション
// ========================================================

/**
 * Refresh Token によるトークン更新リクエストのスキーマ
 */
export const authRefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
})

export type AuthRefreshRequest = z.infer<typeof authRefreshRequestSchema>

/**
 * Refresh Token によるトークン更新レスポンスのスキーマ
 */
export const authRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
})

export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>

// ========================================================
// POST /api/auth/dev-login - 開発環境専用ログイン
// ========================================================

/**
 * dev-login リクエストのスキーマ
 *
 * production 環境では受け付けない（API 側で 404 を返す）。
 * email は seed で投入済みの dev ユーザー (例: alice@dev.local) を想定。
 */
export const authDevLoginRequestSchema = z.object({
  email: z.string().email(),
})

export type AuthDevLoginRequest = z.infer<typeof authDevLoginRequestSchema>

/**
 * dev-login レスポンスのスキーマ
 *
 * authGithubResponseSchema と互換にして Web 側で同じ setAuthCookies に渡せるようにする
 * （is_new_user は dev-login では常に false なので含めない）
 */
export const authDevLoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: authUserSchema,
})

export type AuthDevLoginResponse = z.infer<typeof authDevLoginResponseSchema>

// ========================================================
// POST /api/auth/logout - Refresh Token を無効化
// ========================================================

/**
 * ログアウトリクエストのスキーマ
 */
export const authLogoutRequestSchema = z.object({
  refresh_token: z.string().min(1),
})

export type AuthLogoutRequest = z.infer<typeof authLogoutRequestSchema>

/**
 * ログアウトレスポンスのスキーマ
 */
export const authLogoutResponseSchema = z.object({
  message: z.literal("OK"),
})

export type AuthLogoutResponse = z.infer<typeof authLogoutResponseSchema>
