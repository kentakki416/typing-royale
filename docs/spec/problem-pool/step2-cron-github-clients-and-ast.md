# step2: GitHub API クライアントと AST 解析の実装

`apps/cron` に GitHub API クライアント（Search / Repos / Tree / Raw + rate-limit ハンドラ）と、TypeScript Compiler API を用いた関数抽出 / コメント除去 / 採用条件チェック / 正規化ハッシュを実装する。**この step では DB への書き込みや CLI エントリは作らない**（step3 で組み合わせる）。各モジュールはユニットテストで個別に動作確認可能な状態にする。

## 対応内容

### `apps/cron/package.json` の依存追加

```jsonc
{
  "dependencies": {
    "@repo/db":      "workspace:^",
    "@repo/errors":  "workspace:^",
    "@repo/logger":  "workspace:^",
    "@sentry/node":  "^8.0.0",
    "typescript":    "^5.9.3",
    "zod":           "^3.25.76"
  },
  "devDependencies": {
    "@types/node":   "^24.10.1",
    "@vitest/coverage-v8": "^4.1.5",
    "vitest":        "^4.1.5"
  }
}
```

### `apps/cron/src/env.ts`

step5（shared-packages migration）と同じパターンで Zod スキーマをインライン定義。

```typescript
import { z } from "zod"

const cronEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  LOGGER_TYPE: z.enum(["pino", "winston", "console", "silent"]).default("pino"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  GITHUB_PAT: z.string().default(""),
  CRAWLER_REPOS_PER_RUN: z.coerce.number().int().positive().default(1),
  CRAWLER_LANGUAGES: z.string().default("typescript,javascript"),
  CRAWLER_MIN_STARS: z.coerce.number().int().positive().default(1000),
  CRAWLER_PUSHED_AFTER: z.string().optional(),
  SENTRY_DSN: z.string().default(""),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "test" && env.GITHUB_PAT.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "GITHUB_PAT is required when NODE_ENV is not 'test'",
      path: ["GITHUB_PAT"],
    })
  }
})

const result = cronEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("❌ Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data
export type CronEnv = typeof env
```

### `apps/cron/src/client/github/rate-limit.ts`

GitHub API レスポンスヘッダの `X-RateLimit-Remaining` / `X-RateLimit-Reset` を読み取り、待機する仕組み。

```typescript
import { logger } from "@repo/logger"

/**
 * Rate limit 状況を表す
 */
export type RateLimitState = {
  remaining: number
  reset: Date
}

export const parseRateLimit = (headers: Headers): RateLimitState | null => {
  const remaining = headers.get("X-RateLimit-Remaining")
  const reset = headers.get("X-RateLimit-Reset")
  if (!remaining || !reset) return null
  return {
    remaining: Number(remaining),
    reset: new Date(Number(reset) * 1000),
  }
}

/**
 * Rate limit に達した場合に reset 時刻まで待機する。
 * 待機時間が maxWaitMs を超える場合は throw（その日の run を failed で終了させる）。
 */
const MAX_WAIT_MS = 30 * 60 * 1000

export const waitForRateLimit = async (state: RateLimitState): Promise<void> => {
  if (state.remaining > 0) return
  const waitMs = state.reset.getTime() - Date.now()
  if (waitMs <= 0) return
  if (waitMs > MAX_WAIT_MS) {
    throw new Error(`Rate limit reset is ${waitMs}ms away, exceeds max wait ${MAX_WAIT_MS}ms`)
  }
  logger.warn("GitHub rate limit hit, waiting", { waitMs, reset: state.reset.toISOString() })
  await new Promise((resolve) => setTimeout(resolve, waitMs))
}
```

### `apps/cron/src/lib/retry.ts`

指数バックオフリトライ。

```typescript
export type RetryOptions = {
  maxAttempts?: number
  baseMs?: number
  factor?: number
  jitterRatio?: number
}

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  options: RetryOptions = {}
): Promise<T> => {
  const { maxAttempts = 3, baseMs = 1000, factor = 2, jitterRatio = 0.2 } = options
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts || !shouldRetry(err)) throw err
      const delay = baseMs * Math.pow(factor, attempt - 1)
      const jitter = delay * jitterRatio * (Math.random() * 2 - 1)
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    }
  }
  throw lastErr
}
```

### `apps/cron/src/client/github/search.ts`

```typescript
import { env } from "../../env"
import { parseRateLimit, waitForRateLimit } from "./rate-limit"

export type GithubSearchItem = {
  id: number
  owner: string
  name: string
  fullName: string
  stars: number
  license: string
  defaultBranch: string
  pushedAt: string
}

export type GithubSearchResult = {
  totalCount: number
  items: GithubSearchItem[]
}

const LICENSE_FILTER = "license:mit license:apache-2.0 license:bsd-3-clause license:isc"

const buildQuery = (language: string, minStars: number, pushedAfter: string): string =>
  `language:${language} ${LICENSE_FILTER} stars:>=${minStars} pushed:>${pushedAfter} archived:false`

export const searchRepos = async (
  language: string,
  page: number,
  options: { minStars?: number; pushedAfter?: string } = {}
): Promise<GithubSearchResult> => {
  const minStars = options.minStars ?? env.CRAWLER_MIN_STARS
  const pushedAfter = options.pushedAfter ?? defaultPushedAfter()
  const q = buildQuery(language, minStars, pushedAfter)
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`
  const res = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_PAT}`,
      "User-Agent": "typing-royale-crawler/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
  const rateLimit = parseRateLimit(res.headers)
  if (rateLimit) await waitForRateLimit(rateLimit)
  if (!res.ok) throw new GithubApiError(res.status, await res.text())
  const json = await res.json()
  return {
    totalCount: json.total_count,
    items: json.items.map(toSearchItem),
  }
}

const toSearchItem = (raw: unknown): GithubSearchItem => {
  /** ... 型ガード + マッピング ... */
}

const defaultPushedAfter = (): string => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

export class GithubApiError extends Error {
  constructor(public statusCode: number, public body: string) {
    super(`GitHub API error: ${statusCode}`)
  }
}
```

### `apps/cron/src/client/github/repos.ts`

```typescript
import { env } from "../../env"

export type GithubRepoMeta = {
  id: number
  owner: string
  name: string
  fullName: string
  description: string | null
  homepage: string | null
  topics: string[]
  stars: number
  license: string | null
  defaultBranch: string
  commitSha: string
}

export const getRepoMeta = async (owner: string, repo: string): Promise<GithubRepoMeta> => {
  const url = `https://api.github.com/repos/${owner}/${repo}`
  const res = await fetch(url, { headers: githubHeaders() })
  if (!res.ok) throw new GithubApiError(res.status, await res.text())
  const json = await res.json()
  /** default_branch から HEAD の commit SHA を取得（別エンドポイント /git/refs/heads/{branch}） */
  const sha = await getCommitSha(owner, repo, json.default_branch)
  return {
    id: json.id,
    owner: json.owner.login,
    name: json.name,
    fullName: json.full_name,
    description: json.description,
    homepage: json.homepage,
    topics: json.topics ?? [],
    stars: json.stargazers_count,
    license: json.license?.spdx_id ?? null,
    defaultBranch: json.default_branch,
    commitSha: sha,
  }
}

const getCommitSha = async (owner: string, repo: string, branch: string): Promise<string> => {
  /** GET /repos/:owner/:repo/git/refs/heads/:branch → object.sha */
}
```

### `apps/cron/src/client/github/tree.ts`

```typescript
export type GithubTreeEntry = {
  path: string
  type: "blob" | "tree"
  size: number | null
}

const EXCLUDED_PATTERNS = [
  /^node_modules\//,
  /\/node_modules\//,
  /^dist\//,
  /^build\//,
  /\.test\./,
  /\.spec\./,
  /\.d\.ts$/,
]

const TARGET_EXTENSIONS = /\.(ts|tsx|js|jsx)$/

export const listSourceFiles = async (
  owner: string,
  repo: string,
  commitSha: string
): Promise<GithubTreeEntry[]> => {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`
  const res = await fetch(url, { headers: githubHeaders() })
  if (!res.ok) throw new GithubApiError(res.status, await res.text())
  const json = await res.json()
  return (json.tree as unknown[])
    .map(toTreeEntry)
    .filter((e): e is GithubTreeEntry => e !== null)
    .filter((e) => e.type === "blob")
    .filter((e) => TARGET_EXTENSIONS.test(e.path))
    .filter((e) => !EXCLUDED_PATTERNS.some((p) => p.test(e.path)))
    .filter((e) => (e.size ?? 0) <= 100_000)  // 100KB 上限
}
```

### `apps/cron/src/client/github/raw.ts`

```typescript
export const getRawContent = async (
  owner: string,
  repo: string,
  commitSha: string,
  path: string
): Promise<string> => {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${path}`
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${env.GITHUB_PAT}`, "User-Agent": "typing-royale-crawler/1.0" },
  })
  if (!res.ok) throw new GithubApiError(res.status, await res.text())
  return await res.text()
}
```

### `apps/cron/src/ast/extract-functions.ts`

```typescript
import * as ts from "typescript"

export type ExtractedFunction = {
  functionName: string
  sourceLineStart: number  // 1-indexed
  sourceLineEnd: number
  /** コメント除去前の元テキスト */
  rawText: string
}

export const extractFunctions = (sourceFile: ts.SourceFile): ExtractedFunction[] => {
  const result: ExtractedFunction[] = []
  const visit = (node: ts.Node) => {
    const fn = tryExtract(node, sourceFile)
    if (fn) result.push(fn)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}

const tryExtract = (node: ts.Node, sf: ts.SourceFile): ExtractedFunction | null => {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return build(node, sf, node.name.text)
  }
  if (ts.isMethodDeclaration(node) && node.name) {
    return build(node, sf, node.name.getText(sf))
  }
  if (ts.isVariableDeclaration(node) && node.initializer && node.name) {
    const init = node.initializer
    if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && ts.isIdentifier(node.name)) {
      return build(init, sf, node.name.text)
    }
  }
  if (ts.isPropertyAssignment(node) && ts.isArrowFunction(node.initializer)) {
    const key = node.name.getText(sf)
    return build(node.initializer, sf, key)
  }
  return null
}

const build = (node: ts.Node, sf: ts.SourceFile, name: string): ExtractedFunction => {
  const start = node.getStart(sf)
  const end = node.getEnd()
  const { line: lineStart } = sf.getLineAndCharacterOfPosition(start)
  const { line: lineEnd } = sf.getLineAndCharacterOfPosition(end)
  return {
    functionName: name,
    sourceLineStart: lineStart + 1,
    sourceLineEnd: lineEnd + 1,
    rawText: sf.text.slice(start, end),
  }
}
```

### `apps/cron/src/ast/strip-comments.ts`

```typescript
import * as ts from "typescript"

export const stripComments = (rawText: string): string => {
  const sf = ts.createSourceFile("__inline.ts", rawText, ts.ScriptTarget.Latest, true)
  const ranges: Array<[number, number]> = []
  const collect = (node: ts.Node) => {
    ts.forEachLeadingCommentRange(rawText, node.getFullStart(), (pos, end) => {
      ranges.push([pos, end])
    })
    ts.forEachTrailingCommentRange(rawText, node.getEnd(), (pos, end) => {
      ranges.push([pos, end])
    })
    ts.forEachChild(node, collect)
  }
  collect(sf)
  /** 重複範囲をマージしてから逆順で削除 */
  const merged = mergeRanges(ranges)
  let stripped = rawText
  for (const [pos, end] of merged.reverse()) {
    stripped = stripped.slice(0, pos) + stripped.slice(end)
  }
  /** 連続空行を 1 行に折り畳む */
  return stripped.replace(/\n{3,}/g, "\n\n")
}

const mergeRanges = (ranges: Array<[number, number]>): Array<[number, number]> => {
  /** start 昇順に sort し、overlap する範囲をマージ */
}
```

### `apps/cron/src/ast/adoption-check.ts`

```typescript
const EXCLUDED_NAMES = new Set([
  "test", "it", "describe", "beforeEach", "afterEach", "beforeAll", "afterAll", "setup", "teardown",
])

export type AdoptionResult =
  | { adopted: true; charCount: number; lineCount: number }
  | { adopted: false; reason: string }

export const checkAdoption = (
  functionName: string,
  codeStripped: string
): AdoptionResult => {
  if (!functionName || EXCLUDED_NAMES.has(functionName)) {
    return { adopted: false, reason: "excluded_function_name" }
  }
  const trimmed = codeStripped.trim()
  if (trimmed.length === 0) return { adopted: false, reason: "empty_after_strip" }
  const charCount = trimmed.length
  if (charCount < 100 || charCount > 400) {
    return { adopted: false, reason: "char_count_out_of_range" }
  }
  const lines = trimmed.split("\n")
  if (lines.length < 5 || lines.length > 25) {
    return { adopted: false, reason: "line_count_out_of_range" }
  }
  if (lines.some((l) => l.length > 120)) {
    return { adopted: false, reason: "line_too_long" }
  }
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return { adopted: false, reason: "non_ascii" }
  }
  return { adopted: true, charCount, lineCount: lines.length }
}
```

### `apps/cron/src/ast/normalize-for-hash.ts`

```typescript
import { createHash } from "node:crypto"

export const normalize = (codeStripped: string): string =>
  codeStripped.replace(/\s+/g, " ").trim()

export const astHashOf = (codeStripped: string): string =>
  createHash("sha256").update(normalize(codeStripped)).digest("hex")
```

### `apps/cron/src/lib/source-url.ts`

```typescript
export const buildSourceUrl = (
  owner: string,
  repo: string,
  commitSha: string,
  filePath: string,
  lineStart: number,
  lineEnd: number
): string =>
  `https://github.com/${owner}/${repo}/blob/${commitSha}/${filePath}#L${lineStart}-L${lineEnd}`
```

### ユニットテスト

`apps/cron/test/ast/` 配下に以下を作成。GitHub API クライアントは外部依存のため step3 の integration テストで扱う。

| テストファイル | カバー範囲 |
|---|---|
| `extract-functions.test.ts` | FunctionDeclaration / ArrowFunctionExpression / FunctionExpression / MethodDeclaration / オブジェクトメソッドの 5 ケース |
| `strip-comments.test.ts` | JSDoc / 行コメント / 行末コメント / 文字列内 `//` の保護 / 連続空行の折り畳み |
| `adoption-check.test.ts` | 全 reason の異常系 + 1 つの正常系。describe で「正常系」「異常系」分類（apps/api/CLAUDE.md ルール） |
| `normalize-for-hash.test.ts` | 空白パターン違いで同一ハッシュ / コメント有無で同一ハッシュ / 識別子違いで別ハッシュ |
| `lib/retry.test.ts` | 1 回目失敗→ 2 回目成功 / 3 回失敗で throw / shouldRetry=false で即 throw |
| `lib/source-url.test.ts` | 期待 URL を生成 |

`vitest.config.ts` を `apps/cron/` 配下に追加（apps/api の設定を流用、`include: ["test/**/*.test.ts"]`）。

### TODO.md の更新

Phase 2 の以下を `[x]` に：
- GitHub Search/Repos/Tree/Raw API クライアント実装
- TypeScript Compiler API による AST 解析
- FunctionDeclaration / ArrowFunctionExpression / FunctionExpression / MethodDeclaration を抽出
- 行範囲取得
- コメント除去ロジック
- 採用条件チェック
- AST 正規化ハッシュで重複排除

## 動作確認

### ユニットテスト

```bash
pnpm --filter cron test
```

`extract-functions` / `strip-comments` / `adoption-check` / `normalize-for-hash` / `retry` / `source-url` の全テストが緑になる。

### GitHub API クライアントの動作確認（手動 smoke test）

`GITHUB_PAT` を `.env.local` にセットしてから、`apps/cron/scripts/smoke-github.ts` を作って実行（commit せず捨てスクリプト扱い）：

```typescript
import { searchRepos } from "../src/client/github/search"
import { getRepoMeta } from "../src/client/github/repos"
import { listSourceFiles } from "../src/client/github/tree"
import { getRawContent } from "../src/client/github/raw"

const result = await searchRepos("typescript", 1)
console.log(`Found ${result.totalCount}, top: ${result.items[0].fullName}`)

const meta = await getRepoMeta("colinhacks", "zod")
console.log(meta)

const files = await listSourceFiles("colinhacks", "zod", meta.commitSha)
console.log(`Files: ${files.length}, first: ${files[0]?.path}`)

const raw = await getRawContent("colinhacks", "zod", meta.commitSha, files[0].path)
console.log(`First file head:\n${raw.slice(0, 200)}`)
```

```bash
dotenvx run -f apps/cron/.env.local -- tsx apps/cron/scripts/smoke-github.ts
```

期待: Search の totalCount が出る、`colinhacks/zod` のメタが取れる、ファイル一覧 / 本文が取れる。

### Lint / Build

```bash
pnpm --filter cron lint
pnpm --filter cron build
```

両方緑。

### Type Check（ルート）

```bash
pnpm build
```

`packages/db` ビルド → `apps/cron` ビルドの順で通る。
