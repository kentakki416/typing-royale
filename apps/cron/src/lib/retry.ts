/**
 * 指数バックオフ + jitter 付きのリトライヘルパ
 *
 * GitHub API の 5xx 応答や一時的なネットワーク障害を吸収するための汎用ユーティリティ。
 * 404 や認可エラーのような「リトライしても意味がない」ケースは shouldRetry=false で
 * 即 throw させて Service 側で disable / 通知に倒す。
 *
 * リトライ間隔は base * factor^(attempt-1) ± jitterRatio で計算する。
 * デフォルト（base=1s, factor=2, maxAttempts=3, jitter ±20%）の場合:
 *   1 回目失敗 → ~1s 待機 → 2 回目試行
 *   2 回目失敗 → ~2s 待機 → 3 回目試行
 *   3 回目失敗 → throw（合計 ~3 秒）
 */

export type RetryOptions = {
  baseMs?: number
  factor?: number
  jitterRatio?: number
  maxAttempts?: number
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  options: RetryOptions = {}
): Promise<T> => {
  const { baseMs = 1000, factor = 2, jitterRatio = 0.2, maxAttempts = 3 } = options
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts || !shouldRetry(err)) throw err
      const delay = baseMs * Math.pow(factor, attempt - 1)
      const jitter = delay * jitterRatio * (Math.random() * 2 - 1)
      await sleep(Math.max(0, delay + jitter))
    }
  }
  /** maxAttempts ループ後に必ず throw する想定だが TypeScript の網羅判定のため再 throw */
  throw lastErr
}
