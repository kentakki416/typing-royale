import { env } from "../../env"

/**
 * GitHub API へのリクエストで共通して送るヘッダー
 *
 * - Authorization: PAT を Bearer で送る（public_repo スコープのみ想定）
 * - Accept: GitHub REST API のバージョン指定
 * - User-Agent: GitHub から要求される識別子
 * - X-GitHub-Api-Version: REST API のバージョン明示
 */
export const githubHeaders = (): Record<string, string> => ({
  "Accept": "application/vnd.github+json",
  "Authorization": `Bearer ${env.GITHUB_PAT}`,
  "User-Agent": "typing-royale-crawler/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
})
