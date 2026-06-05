import { githubFetch } from "./fetch"
import { githubHeaders } from "./headers"

/**
 * GitHub Repos API クライアント
 *
 * `GET /repos/{owner}/{name}` でメタ情報（description / topics / license 等）を
 * 取り、合わせて default branch の HEAD コミット SHA を別エンドポイントで取得して
 * permalink 生成用の commitSha として返す。
 */

export type GithubRepoMeta = {
  id: number
  commitSha: string
  defaultBranch: string
  description: string | null
  fullName: string
  homepage: string | null
  /** SPDX ID。GitHub が判別できなければ null（ライセンス再検証で disable 候補） */
  license: string | null
  name: string
  owner: string
  stars: number
  topics: string[]
}

export const getRepoMeta = async (owner: string, repo: string): Promise<GithubRepoMeta> => {
  const url = `https://api.github.com/repos/${owner}/${repo}`
  const res = await githubFetch(url, { headers: githubHeaders() })
  const json = (await res.json()) as {
    default_branch: string
    description: string | null
    full_name: string
    homepage: string | null
    id: number
    license: { spdx_id: string | null } | null
    name: string
    owner: { login: string }
    stargazers_count: number
    topics: string[] | undefined
  }
  const sha = await getCommitSha(owner, repo, json.default_branch)
  return {
    id: json.id,
    commitSha: sha,
    defaultBranch: json.default_branch,
    description: json.description,
    fullName: json.full_name,
    homepage: json.homepage,
    license: json.license?.spdx_id ?? null,
    name: json.name,
    owner: json.owner.login,
    stars: json.stargazers_count,
    /** GitHub は topics 未設定の repo で undefined を返すケースがある */
    topics: json.topics ?? [],
  }
}

const getCommitSha = async (owner: string, repo: string, branch: string): Promise<string> => {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`
  const res = await githubFetch(url, { headers: githubHeaders() })
  const json = (await res.json()) as { object: { sha: string } }
  return json.object.sha
}
