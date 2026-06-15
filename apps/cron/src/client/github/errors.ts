/**
 * GitHub API 呼び出しで発生するエラーの共通クラス
 *
 * `statusCode` フィールドを持つことで、lib/retry.ts の retryWithBackoff が
 * 「5xx ならリトライ」判定をできるようにする。
 *
 * 一般的なネットワークエラー（DNS 失敗 / TCP reset 等）は fetch が native の
 * TypeError を throw するため、GithubApiError(599) で wrap して「statusCode >= 500
 * = リトライ対象」のルートに乗せる。
 *
 * ただし「fetch timeout（AbortController で abort）」は本クラスではなく
 * GithubFetchTimeoutError を使う（巨大 repo を素早く諦めるため、リトライ非対象）。
 */
export class GithubApiError extends Error {
  constructor(
    public statusCode: number,
    public body: string
  ) {
    super(`GitHub API error: ${statusCode}`)
    this.name = "GithubApiError"
  }
}

/**
 * GitHub API 呼び出しが timeout (AbortController.abort) で打ち切られたときに throw する。
 *
 * `statusCode` を **意図的に持たない** ことで retryWithBackoff の対象から外している。
 * 「待っても変わらない」型のエラーで、リトライよりも「諦めて次の repo へ進む」方が
 * 賢い（vscode 級の巨大 repo に対してクローラが詰まらないようにする）。
 *
 * 呼び出し側（processRepo）でこのエラーを catch し、`crawled_repos.disabled = true`
 * (reason="fetch_timeout") で記録すれば次回の pickNextRepo は同 repo を選ばなくなる。
 */
export class GithubFetchTimeoutError extends Error {
  constructor(
    public url: string,
    public timeoutMs: number
  ) {
    super(`GitHub fetch timed out after ${timeoutMs}ms: ${url}`)
    this.name = "GithubFetchTimeoutError"
  }
}
