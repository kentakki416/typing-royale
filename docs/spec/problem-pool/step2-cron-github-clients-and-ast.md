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

const cronEnvSchema = z
  .object({
    CRAWLER_MIN_STARS: z.coerce.number().int().positive().default(1000),
    CRAWLER_PUSHED_AFTER: z.string().optional(),
    CRAWLER_REPOS_PER_RUN: z.coerce.number().int().positive().default(1),
    DATABASE_URL: z.string().url().optional(),
    GITHUB_PAT: z.string().default(""),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOGGER_TYPE: z.enum(["pino", "winston", "console", "silent"]).default("pino"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    SENTRY_DSN: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    /** NODE_ENV !== "test" のとき GITHUB_PAT は必須（未設定だと crawler が GitHub に叩けない） */
    if (env.NODE_ENV !== "test" && env.GITHUB_PAT.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GITHUB_PAT is required when NODE_ENV is not 'test'",
        path: ["GITHUB_PAT"],
      })
    }
    /** production では SENTRY_DSN も必須（本番エラー検知漏れ防止） */
    if (env.NODE_ENV === "production" && env.SENTRY_DSN.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SENTRY_DSN is required when NODE_ENV is 'production'",
        path: ["SENTRY_DSN"],
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
  baseMs?: number
  factor?: number
  jitterRatio?: number
  maxAttempts?: number
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
  commitSha: string
  defaultBranch: string
  description: string | null
  fullName: string
  homepage: string | null
  license: string | null
  name: string
  owner: string
  stars: number
  topics: string[]
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
    commitSha: sha,
    defaultBranch: json.default_branch,
    description: json.description,
    fullName: json.full_name,
    homepage: json.homepage,
    license: json.license?.spdx_id ?? null,
    name: json.name,
    owner: json.owner.login,
    stars: json.stargazers_count,
    topics: json.topics ?? [],
  }
}

const getCommitSha = async (owner: string, repo: string, branch: string): Promise<string> => {
  /** GET /repos/:owner/:repo/git/refs/heads/:branch → object.sha */
}
```

### `apps/cron/src/client/github/tree.ts`

**重要**: テストファイル・テストディレクトリは AST パース前に **ファイル単位で除外** する。テスト系コードは関数名（`test` / `it` / `describe` 等）が `checkAdoption` で除外される可能性が高いため、AST パースまで走らせる時間が無駄になる。

`EXCLUDED_PATTERNS` は OSS で広く使われている命名規約 / ディレクトリ慣習を網羅的にカバーする:

```typescript
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
  /\.test\./,                      // foo.test.ts, foo.test.tsx
  /\.spec\./,                      // foo.spec.ts (Jasmine / Mocha 系)
  /[-_]test\.[jt]sx?$/,            // foo-test.ts, foo_test.ts

  /** テストディレクトリ */
  /^(__tests__|tests?|e2e|cypress)\//,  // ルート直下
  /\/(__tests__|tests?|e2e|cypress)\//, // 深い位置
  /^__mocks__\//,
  /\/__mocks__\//,

  /** ノイズ（実装ロジックではない） */
  /\.stories\.[jt]sx?$/,           // Storybook
  /\.fixtures?\./,                 // フィクスチャ
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
    .filter((e) => (e.size ?? 0) <= 100_000) /** 100KB 上限 */
}
```

#### フィルタリング効果

| 項目 | 値 |
|---|---|
| OSS 1 repo の `.ts` / `.js` ファイル数 | 100〜1000 |
| そのうちテスト系の割合（平均） | 30〜50% |
| 除外することで節約できる処理 | Raw ファイル取得 + AST パース |
| 1 repo あたりの体感削減 | 数十秒〜数分 |

「ファイル単位の除外」は AST 段階・DB 段階の除外より圧倒的に効率が良い（ダウンロード自体しない）ため、ここでなるべく漏らさず弾く。

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

**重要**: 関数ノードを抽出したら **子ノードへの再帰を止める**。さもないとメソッド内のアロー関数や IIFE 等のネスト関数が二重抽出され、astHash が衝突する。仕様（README）でも「ネストされた内側の関数は抽出対象外」と明記。

```typescript
import * as ts from "typescript"

export type ExtractedFunction = {
  functionName: string
  /** コメント除去前の元テキスト */
  rawText: string
  sourceLineEnd: number
  /** 1-indexed */
  sourceLineStart: number
}

export const extractFunctions = (sourceFile: ts.SourceFile): ExtractedFunction[] => {
  const result: ExtractedFunction[] = []
  const visit = (node: ts.Node): void => {
    const fn = tryExtract(node, sourceFile)
    if (fn) {
      result.push(fn)
      /** 抽出済みノードの子は走査しない（ネスト関数の二重抽出を防ぐ） */
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}

const tryExtract = (node: ts.Node, sf: ts.SourceFile): ExtractedFunction | null => {
  /** 1. function foo(...) {} */
  if (ts.isFunctionDeclaration(node) && node.name) {
    return build(node, sf, node.name.text)
  }
  /** 2. class メソッド / オブジェクトメソッド */
  if (ts.isMethodDeclaration(node) && node.name) {
    return build(node, sf, node.name.getText(sf))
  }
  /** 3. const foo = (...) => {} / const foo = function (...) {} */
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
    const init = node.initializer
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      return build(init, sf, node.name.text)
    }
  }
  /** 4. オブジェクトリテラルのプロパティアロー関数 { foo: () => {} }（README で採用対象に含む） */
  if (ts.isPropertyAssignment(node) && ts.isArrowFunction(node.initializer)) {
    return build(node.initializer, sf, node.name.getText(sf))
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
    rawText: sf.text.slice(start, end),
    sourceLineEnd: lineEnd + 1,
    sourceLineStart: lineStart + 1,
  }
}
```

### `apps/cron/src/ast/remove-comments.ts`

`ts.createScanner` で全トリビアトークンを走査する実装に変更（`forEachLeading/TrailingCommentRange` のノード再帰ベースは leading/trailing が重複列挙されたり、SourceFile 直下のコメントが取りこぼされる懸念があるため）。

```typescript
import * as ts from "typescript"

/**
 * コメント除去：scanner で全コメントトークンを舐めて文字列リテラル・正規表現リテラル
 * を保護しつつ、後ろから削除する。
 *
 * scanner はトークン単位なので：
 * - SingleLineCommentTrivia / MultiLineCommentTrivia → コメント
 * - StringLiteral / RegularExpressionLiteral → そのまま温存（`"https://..."` 内の // を保護）
 * - その他のトリビア（空白）は保持
 */
export const removeComments = (rawText: string): string => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /** skipTrivia */ false,
    ts.LanguageVariant.Standard,
    rawText
  )

  const ranges: Array<[number, number]> = []
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      ranges.push([scanner.getTokenStart(), scanner.getTokenEnd()])
    }
    token = scanner.scan()
  }

  /** 後ろから削除（前から消すとインデックスがズレる） */
  let stripped = rawText
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [pos, end] = ranges[i]
    stripped = stripped.slice(0, pos) + stripped.slice(end)
  }

  /** 連続空行を 1 行に折り畳む */
  return stripped.replace(/\n{3,}/g, "\n\n")
}
```

`mergeRanges` が不要になる（scanner が重複しないトークン境界を返すため）。文字列リテラル内の `//` は scanner が `StringLiteral` トークンとして識別するので自動で保護される。

### `apps/cron/src/ast/adoption-check.ts`

```typescript
const EXCLUDED_NAMES = new Set([
  "afterAll",
  "afterEach",
  "beforeAll",
  "beforeEach",
  "describe",
  "it",
  "setup",
  "teardown",
  "test",
])

export type AdoptionResult =
  | { adopted: true; charCount: number; lineCount: number }
  | { adopted: false; reason: AdoptionRejectReason }

export type AdoptionRejectReason =
  | "char_count_out_of_range"
  | "empty_after_strip"
  | "excluded_function_name"
  | "line_count_out_of_range"
  | "line_too_long"
  | "non_ascii"

export const checkAdoption = (functionName: string, codeStripped: string): AdoptionResult => {
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
  /** eslint-disable-next-line no-control-regex */
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

`apps/cron/test/` 配下に以下を作成。**全テストは `describe("正常系", ...)` / `describe("異常系", ...)` で必ず分類する**（apps/api/CLAUDE.md 規約）。

#### AST モジュール

| テストファイル | カバー範囲 |
|---|---|
| `ast/extract-functions.test.ts` | FunctionDeclaration / ArrowFunctionExpression / FunctionExpression / MethodDeclaration / オブジェクトプロパティアロー関数の 5 ケース。**メソッド内のアロー関数が二重抽出されないこと** |
| `ast/remove-comments.test.ts` | JSDoc / 行コメント / 行末コメント / 文字列リテラル内 `//` の保護 / テンプレートリテラル / 正規表現リテラル / 連続空行の折り畳み |
| `ast/adoption-check.test.ts` | 各 reject reason の異常系 + ちょうど境界（100 / 400 文字、5 / 25 行、120 文字行）の境界値テスト + 正常系 |
| `ast/normalize-for-hash.test.ts` | 空白パターン違いで同一ハッシュ / コメント有無で同一ハッシュ / 識別子違いで別ハッシュ |

#### lib

| テストファイル | カバー範囲 |
|---|---|
| `lib/retry.test.ts` | 1 回目失敗→ 2 回目成功 / 3 回失敗で throw / `shouldRetry=false` で即 throw |
| `lib/source-url.test.ts` | 期待 URL（`#L1-L20`）を生成 |

#### GitHub クライアント（fixture ベース）

`fetch` を `vi.fn()` で差し替え、`apps/cron/test/fixtures/github/` 配下に置いた GitHub API レスポンス JSON を返す形でパース層を検証する。**ネットワークは一切叩かない**ので CI / ローカル両方で安定実行。

| テストファイル | カバー範囲 |
|---|---|
| `client/github/search.test.ts` | クエリ組み立て（`language:` / `license:` の連結が正しい）/ 正常レスポンスのパース / `totalCount` の取得 / `X-RateLimit-Remaining: 0` のときの待機判定 |
| `client/github/repos.test.ts` | description / homepage / topics の取得 / **`license: null` のケース** / **`topics: undefined` のケース**（古い repo） / `getCommitSha` の合成 |
| `client/github/tree.test.ts` | 拡張子フィルタ（`.ts` / `.js` 採用、`.d.ts` 除外）/ EXCLUDED_PATTERNS の主要パターン（`node_modules/` / `.test.` / `.spec.` / `-test.ts` / `__tests__/` / `tests/` / `e2e/` / `__mocks__/` / `.stories.` / `.fixtures.`）/ `size > 100KB` のスキップ |
| `client/github/rate-limit.test.ts` | `parseRateLimit` の正常系 / ヘッダ欠落で null / `waitForRateLimit` の reset 待機 / `MAX_WAIT_MS` 超過で throw |

fixture 例：

```
apps/cron/test/fixtures/github/
├── search-typescript-page1.json          # GitHub Search API のレスポンス
├── repos-colinhacks-zod.json             # /repos/colinhacks/zod のレスポンス
├── repos-license-null.json               # license: null のエッジケース
├── repos-topics-undefined.json           # topics: undefined のエッジケース
└── tree-colinhacks-zod-recursive.json    # /git/trees/:sha?recursive=1 のレスポンス
```

これらは GitHub API ドキュメント例をベースに最小化した JSON。real API を叩いて取得した内容は **個人情報・rate limit の漏洩を避けるため** owner/email 等を匿名化してから commit する。

`vitest.config.ts` を `apps/cron/` 配下に追加（apps/api の設定を流用、`include: ["test/**/*.test.ts"]`）。`fileParallelism: false` は不要（DB を使わないため並列実行可）。

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

`extract-functions` / `remove-comments` / `adoption-check` / `normalize-for-hash` / `retry` / `source-url` の全テストが緑になる。

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
