import { env } from "../../env"

import { githubFetch } from "./fetch"
import { githubHeaders } from "./headers"

/**
 * GitHub Search Repositories API のクライアント
 *
 * docs/spec/problem-pool/README.md「取得元の選定」のフィルタ条件:
 *   - language:{slug}
 *   - license:mit | license:apache-2.0 | license:bsd-3-clause | license:isc
 *   - stars:>={CRAWLER_MIN_STARS}
 *   - pushed:>{CRAWLER_PUSHED_AFTER もしくは実行日 - 2 年}
 *   - archived:false
 *   - sort=stars-desc
 *   - per_page=100
 */

export type GithubSearchItem = {
  id: number
  defaultBranch: string
  fullName: string
  license: string
  name: string
  owner: string
  pushedAt: string
  stars: number
}

export type GithubSearchResult = {
  items: GithubSearchItem[]
  totalCount: number
}

const LICENSE_FILTER = "license:mit license:apache-2.0 license:bsd-3-clause license:isc"

const buildQuery = (language: string, minStars: number, pushedAfter: string): string =>
  `language:${language} ${LICENSE_FILTER} stars:>=${minStars} pushed:>${pushedAfter} archived:false`

const defaultPushedAfter = (): string => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

export const searchRepos = async (
  language: string,
  page: number,
  options: { minStars?: number; pushedAfter?: string } = {}
): Promise<GithubSearchResult> => {
  const minStars = options.minStars ?? env.CRAWLER_MIN_STARS
  const pushedAfter = options.pushedAfter ?? env.CRAWLER_PUSHED_AFTER ?? defaultPushedAfter()
  const q = buildQuery(language, minStars, pushedAfter)
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`
  const res = await githubFetch(url, { headers: githubHeaders() })
  const json = (await res.json()) as {
    total_count: number
    items: unknown[]
  }
  return {
    items: json.items.map(toSearchItem),
    totalCount: json.total_count,
  }
}

const toSearchItem = (raw: unknown): GithubSearchItem => {
  const r = raw as {
    default_branch: string
    full_name: string
    id: number
    license: { spdx_id: string | null } | null
    name: string
    owner: { login: string }
    pushed_at: string
    stargazers_count: number
  }
  return {
    id: r.id,
    defaultBranch: r.default_branch,
    fullName: r.full_name,
    /** license が null や spdx_id 不明な場合は空文字（呼び出し側で弾く） */
    license: r.license?.spdx_id ?? "",
    name: r.name,
    owner: r.owner.login,
    pushedAt: r.pushed_at,
    stars: r.stargazers_count,
  }
}
