import rateLimit from "express-rate-limit"

/**
 * API 全体のレート制限。
 *
 * 同一クライアント（IP 単位）が一定時間内に送れるリクエスト数に上限を設け、
 * ブルートフォースやアプリ層 DoS を緩和する。上限を超えたら 429 を返す。
 * 認証の有無で基準を変える必要は無いため、全エンドポイントに同じ上限を適用する。
 *
 * 上限値（1 分あたり 300 リクエスト）は、ログインユーザーがマイページ等で複数 API を
 * 並列取得しても引っかからない程度に緩く、かつ機械的な連打は止まる水準。必要に応じ調整可。
 *
 * 注意: カウントは in-memory（ECS タスク単位）。複数タスク構成では実効上限がタスク数倍に
 * なるため、厳密な分散制限が要る場合は Redis ストア化や AWS WAF を後続で検討する。
 */
export const apiRateLimiter = rateLimit({
  legacyHeaders: false,
  limit: 300,
  message: { error: "Too many requests", status_code: 429 },
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
})
