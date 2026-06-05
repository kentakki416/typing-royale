import { env } from "../../env"

import { githubFetch } from "./fetch"

/**
 * GitHub Raw Content API クライアント
 *
 * `https://raw.githubusercontent.com/{owner}/{name}/{sha}/{path}` でファイル本文を
 * UTF-8 文字列として取得する。
 *
 * 認証は不要だが PAT を付けることでアカウント単位のレート制限になる
 * （非認証だと IP 単位で 60 req/h と厳しい）。Accept ヘッダはデフォルトで OK。
 */
export const getRawContent = async (
  owner: string,
  repo: string,
  commitSha: string,
  path: string
): Promise<string> => {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${path}`
  const res = await githubFetch(url, {
    headers: {
      "Authorization": `Bearer ${env.GITHUB_PAT}`,
      "User-Agent": "typing-royale-crawler/1.0",
    },
  })
  return res.text()
}
