/**
 * GitHub クライアントが返すドメイン型
 *
 * GitHub の生レスポンス（snake_case）から camelCase / 必要フィールドのみに整形した
 * 後の形。CLI / Repository から見える public 型はここに集約する。
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

export type GithubTreeEntry = {
  path: string
  size: number | null
  type: "blob" | "tree"
}
