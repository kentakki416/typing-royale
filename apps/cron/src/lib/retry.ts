/**
 * 指数バックオフ + jitter 付きのリトライヘルパ
 *
 * `statusCode >= 500` のエラーを HTTP サーバエラーとみなしてリトライする。
 * 404 / 401 / 403 / 429 のような「リトライしても結果が変わらない」エラー、および
 * `statusCode` を持たないプレーンエラーは即 throw（呼び出し側で disable や
 * rate-limit 待機などに分岐する想定）。
 *
 * GitHub クライアントのエラークラス（GithubApiError）に直接依存させたくないため
 * 構造型 `{ statusCode: number }` で判定する。ネットワークエラー等の
 * `statusCode` を持たないエラーは GitHub クライアント側で wrap してから throw する
 * 責務分担（apps/cron/src/client/github/ で対応）。
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

type WithStatusCode = { statusCode: number }

const hasServerErrorStatus = (err: unknown): err is WithStatusCode =>
  typeof err === "object"
  && err !== null
  && "statusCode" in err
  && typeof (err as WithStatusCode).statusCode === "number"
  && (err as WithStatusCode).statusCode >= 500

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const { baseMs = 1000, factor = 2, jitterRatio = 0.2, maxAttempts = 3 } = options
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts || !hasServerErrorStatus(err)) throw err
      const delay = baseMs * Math.pow(factor, attempt - 1)
      const jitter = delay * jitterRatio * (Math.random() * 2 - 1)
      await sleep(Math.max(0, delay + jitter))
    }
  }
  /** maxAttempts ループ後に必ず throw する想定だが TypeScript の網羅判定のため再 throw */
  throw lastErr
}
