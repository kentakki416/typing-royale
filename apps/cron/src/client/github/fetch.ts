import { GithubApiError } from "./errors"
import { parseRateLimit, waitForRateLimit } from "./rate-limit"

/**
 * GitHub API への共通フェッチヘルパ
 *
 * - レスポンスヘッダから rate limit を読み取り、necessary なら待機
 * - ネットワークエラー（fetch native の TypeError 等）は GithubApiError(599) に
 *   wrap して投げ直す。retryWithBackoff の「statusCode >= 500 ならリトライ」
 *   ルートに乗せるため
 * - HTTP 非 2xx は GithubApiError(status) として throw（4xx は呼び出し側で
 *   disable 判断、5xx はリトライへ）
 */
export const githubFetch = async (
  url: string,
  init: RequestInit
): Promise<Response> => {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    /** ネットワークエラーは 599 として retry 対象に */
    throw new GithubApiError(599, String(err))
  }

  const rateLimit = parseRateLimit(res.headers)
  if (rateLimit) await waitForRateLimit(rateLimit)

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new GithubApiError(res.status, body)
  }

  return res
}
