/**
 * GitHub API 呼び出しで発生するエラーの共通クラス
 *
 * `statusCode` フィールドを持つことで、lib/retry.ts の retryWithBackoff が
 * 「5xx ならリトライ」判定をできるようにする。
 *
 * ネットワークエラー（DNS 失敗 / タイムアウト等）は fetch が native の
 * TypeError 等を throw するが、GithubApiError(599) で wrap してから投げ直すことで
 * 「statusCode >= 500 = リトライ対象」のルートに乗せる。
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
