import { logger } from "@repo/logger"

/**
 * GitHub API のレート制限状態
 *
 * GitHub のレスポンスヘッダ X-RateLimit-Remaining / X-RateLimit-Reset を
 * パースして得る。
 */
export type RateLimitState = {
  /** 現在の時間枠に残っているリクエスト数 */
  remaining: number
  /** レート制限がリセットされる時刻 */
  reset: Date
}

/**
 * レート制限到達時に許容する最大待機時間。
 * これを超える待機が必要な場合は throw して run 全体を failed にする。
 */
const MAX_WAIT_MS = 30 * 60 * 1000

export const parseRateLimit = (headers: Headers): RateLimitState | null => {
  const remaining = headers.get("X-RateLimit-Remaining")
  const reset = headers.get("X-RateLimit-Reset")
  if (remaining === null || reset === null) return null
  return {
    remaining: Number(remaining),
    /** GitHub の reset は Unix epoch（秒）なので 1000 倍してミリ秒に */
    reset: new Date(Number(reset) * 1000),
  }
}

/**
 * `remaining === 0` の場合に reset 時刻まで待機する。
 * remaining > 0 なら何もしない。MAX_WAIT_MS を超える待機が必要なら throw。
 */
export const waitForRateLimit = async (state: RateLimitState): Promise<void> => {
  if (state.remaining > 0) return
  const waitMs = state.reset.getTime() - Date.now()
  if (waitMs <= 0) return
  if (waitMs > MAX_WAIT_MS) {
    throw new Error(
      `Rate limit reset is ${waitMs}ms away, exceeds max wait ${MAX_WAIT_MS}ms`
    )
  }
  logger.warn("GitHub rate limit hit, waiting", {
    reset: state.reset.toISOString(),
    waitMs,
  })
  await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
}
