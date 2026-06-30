import rateLimit from "express-rate-limit"

/**
 * レート制限の共通レスポンス（アプリの ErrorResponse 形に合わせる）。
 * express-rate-limit が 429 ステータスと共に返却する。
 */
const tooManyRequestsBody = { error: "Too many requests", status_code: 429 }

/**
 * 認証系（`POST /api/auth/github` の code 交換 / `/api/auth/refresh` / dev-login）の
 * ブルートフォース・乱打対策。IP 単位で 15 分あたり 50 回に制限する。
 *
 * 注意: 複数 ECS タスク構成ではインスタンスごとのカウントになる（実効上限はタスク数倍）。
 * 厳密な分散制限・WAF は後続で検討する（本ミドルウェアは最低限の緩和層）。
 */
export const authRateLimiter = rateLimit({
  legacyHeaders: false,
  limit: 50,
  message: tooManyRequestsBody,
  standardHeaders: "draft-7",
  windowMs: 15 * 60 * 1000,
})

/**
 * 未認証で叩けるステートレスなゲストプレイ endpoint（`/api/play-sessions/guest/*`）への
 * アプリ層 DoS 対策。IP 単位で 1 分あたり 60 回に制限する。
 */
export const guestPlayRateLimiter = rateLimit({
  legacyHeaders: false,
  limit: 60,
  message: tooManyRequestsBody,
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
})
