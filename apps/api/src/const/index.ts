/**
 * production 以外でのみ公開する dev 専用パス
 *
 * /api/auth/dev-login は seed で投入した dev ユーザーで token を発行する API。
 * production では index.ts でコントローラを生成しないためルート自体が存在しない
 * が、念のため PUBLIC_PATHS からも除外する。
 */
const DEV_ONLY_PUBLIC_PATHS = process.env.NODE_ENV !== "production"
  ? ["/api/auth/dev-login"]
  : []

/**
 * 認証をスキップする公開パス
 * これらのパスではauthMiddlewareが認証チェックをスキップします
 */
export const PUBLIC_PATHS: readonly string[] = [
  "/api/auth/github",
  "/api/auth/google",
  "/api/auth/refresh",
  "/api/crawled-repos",
  "/api/hall-of-fame",
  "/api/health",
  "/api/memo",
  /**
   * ゲストプレイ用のステートレス endpoint。Redis / DB を一切使わずに
   * 問題抽選とスコア集計を行うため、認証なしで公開する。
   * 認証必須の `/api/play-sessions/solo` `/api/play-sessions/:id/finish` 等は
   * このプレフィックスにマッチしないので strict 認証を維持する。
   */
  "/api/play-sessions/guest",
  "/api/players",
  "/api/rankings",
  "/api/replays",
  "/badge",
  "/cache/rewards",
  ...DEV_ONLY_PUBLIC_PATHS,
]

/**
 * PUBLIC_PATHS の prefix match の例外として、明示的に認証必須とするパス
 * 例: `/api/rankings` は公開だが `/api/rankings/me` は認証必須
 */
export const PROTECTED_PATHS: readonly string[] = [
  "/api/hall-of-fame/comments",
  "/api/rankings/me",
]

/**
 * リクエストログを除外するパス
 * これらのパスではrequestLoggerがログを記録しません
 */
export const LOG_EXCLUDE_PATHS = [
  "/api/health",
  "/api/health/ready",
] as const

/**
 * プレイ中ステートの Redis TTL（秒）
 * 120 秒のプレイ + バッファ。/finish で明示削除するため通常は TTL 切れ前に消える
 */
export const PLAY_SESSION_TTL_SECONDS = 300

/**
 * 1 セッションで出題する問題数
 */
export const PROBLEMS_PER_SESSION = 20
