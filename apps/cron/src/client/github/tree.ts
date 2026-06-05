import { githubFetch } from "./fetch"
import { githubHeaders } from "./headers"

/**
 * GitHub Git Tree API クライアント
 *
 * `GET /repos/{owner}/{name}/git/trees/{sha}?recursive=1` で repo の全ファイル
 * パスを取得し、AST 解析の対象（.ts/.tsx/.js/.jsx）に絞ったうえで
 * ノイズ（テスト / Storybook / ビルド成果物等）を除外する。
 *
 * ファイル単位の除外はダウンロード自体しないため、AST パース後や DB INSERT 後の
 * 除外より圧倒的に効率が良い（docs/spec/problem-pool/step2-cron-github-clients-and-ast.md
 * 「フィルタリング効果」参照）。
 */

export type GithubTreeEntry = {
  path: string
  size: number | null
  type: "blob" | "tree"
}

const EXCLUDED_PATTERNS = [
  /** 依存・ビルド成果物 */
  /^node_modules\//,
  /\/node_modules\//,
  /^dist\//,
  /^build\//,
  /\.d\.ts$/,

  /** テストファイル（拡張子 / suffix） */
  /\.test\./,
  /\.spec\./,
  /[-_]test\.[jt]sx?$/,

  /** テストディレクトリ */
  /^(__tests__|tests?|e2e|cypress)\//,
  /\/(__tests__|tests?|e2e|cypress)\//,
  /^__mocks__\//,
  /\/__mocks__\//,

  /** ノイズ（実装ロジックではない） */
  /\.stories\.[jt]sx?$/,
  /\.fixtures?\./,
]

const TARGET_EXTENSIONS = /\.(ts|tsx|js|jsx)$/

/** ファイルサイズの上限（バンドル済みファイル等を除外）*/
const MAX_FILE_SIZE = 100_000

export const listSourceFiles = async (
  owner: string,
  repo: string,
  commitSha: string
): Promise<GithubTreeEntry[]> => {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`
  const res = await githubFetch(url, { headers: githubHeaders() })
  const json = (await res.json()) as { tree: unknown[] }
  return json.tree
    .map(toTreeEntry)
    .filter((e): e is GithubTreeEntry => e !== null)
    .filter((e) => e.type === "blob")
    .filter((e) => TARGET_EXTENSIONS.test(e.path))
    .filter((e) => !EXCLUDED_PATTERNS.some((p) => p.test(e.path)))
    .filter((e) => (e.size ?? 0) <= MAX_FILE_SIZE)
}

const toTreeEntry = (raw: unknown): GithubTreeEntry | null => {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as { path?: unknown; size?: unknown; type?: unknown }
  if (typeof r.path !== "string") return null
  if (r.type !== "blob" && r.type !== "tree") return null
  return {
    path: r.path,
    size: typeof r.size === "number" ? r.size : null,
    type: r.type,
  }
}
