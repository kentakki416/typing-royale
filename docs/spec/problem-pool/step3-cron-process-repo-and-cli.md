# step3: processRepo / task エントリ / crawler_runs 連携

step1 の DB スキーマ（`crawler_runs` + `crawler_run_items` の親子、`Problem.languageId` 非正規化、`@@unique([languageId, astHash])`）と step2 の `GithubClient` + AST モジュールを組み合わせ、`processRepo()` / `pickNextRepo()` / run 追跡 / ライセンス再検証 / task エントリ（言語別の `pnpm crawler:run:<slug>` / `pnpm crawler:license-recheck`）を実装する。**この step 完了で Phase 2 の機能要件が一通り揃う**。

## 設計方針

- **`task/` と `service/<domain>/` で分離**（[`apps/cron/README.md#ディレクトリ戦略`](../../../apps/cron/README.md#ディレクトリ戦略) 準拠）
  - `task/<name>.ts` は env 組み立て + DI + graceful shutdown だけの薄い 1 ファイル
  - 業務ロジックは `service/<domain>/` に集約し、task 横断で再利用可能にする
- **`GithubClient` は task 側で `new` してから service に DI**。service は env を直接読まない
- **部分失敗の継続**: メインループで repo 単位の try-catch、1 件の失敗が次の repo を止めない
- **`Result<T>` の使い方**: 業務エラー = `err(...)`、想定外 = throw（apps/api 規約と一致）。`processRepo` は disabled で記録するだけの正常フローも含むので `Promise<ProcessRepoResult>` の plain union を返す（`Result` ラップは不要）
- **二重起動防止は持たない**: 本処理はべき等（`pickNextRepo` の登録済みスキップ + `@@unique([languageId, astHash])`）なので、重複起動・手動再実行でも問題プールは壊れない
- **`crawler_runs` の orphan running は次回 run 冒頭で救済**: start → succeed/fail の途中で task が死ぬと `status="running"` が残る。次回 run の最初に `markStaleAsFailed` で 30 分以上前の running を `failed` に倒して観測ノイズを掃除する
- **`fail()` 失敗時の元エラーは消えるが許容**: catch 内で `fail()` を呼ぶが nested try/catch は持たない。`fail()` 自体が DB 障害で throw した場合は元エラーが失われるが、ほぼ同じ DB 障害が原因なので調査に支障なし。orphan running は次回 `markStaleAsFailed` で回収されるので、ログを残す価値が低い分はネスト削減を優先

## 配置するファイル一覧

```
apps/cron/src/
├── task/
│   ├── crawler-run-typescript.ts         # 言語別 task（TypeScript、Phase 2 ローンチ時点ではこれのみ）
│   └── crawler-license-recheck.ts        # ライセンス再検証（言語非依存）
├── repository/
│   └── prisma/
│       ├── crawled-repo-repository.ts    # CrawledRepoRepository (+ Domain 型)
│       ├── crawler-run-repository.ts     # CrawlerRunRepository
│       ├── crawler-run-item-repository.ts# CrawlerRunItemRepository
│       ├── language-repository.ts        # LanguageRepository
│       ├── problem-repository.ts         # ProblemRepository
│       └── index.ts                      # barrel export
└── service/
    ├── crawler/
    │   ├── process-repo.ts               # processRepo()
    │   └── pick-next-repo.ts             # pickNextRepo()
    └── license/
        └── verifier.ts                   # licenseRecheck()
```

**Repository は `service/<domain>/` の中ではなく `repository/prisma/` に集約**（apps/api と同じ構造）。service は Repository の interface だけを引数で受け取り、Prisma に直接依存しない。

## 対応内容

### `apps/cron/package.json` に依存追加

```jsonc
{
  "dependencies": {
    "@repo/api-schema": "workspace:^",
    "@repo/db":         "workspace:^",
    "@repo/errors":     "workspace:^",
    "@repo/logger":     "workspace:^",
    "typescript":       "^5.9.3",
    "zod":              "^3.25.76"
  }
}
```

### `apps/cron/src/env.ts` に DATABASE_URL 必須化を追記

step2 では optional だった `DATABASE_URL` を、`NODE_ENV !== "test"` のとき必須にする（task が DB なしで起動できないことを起動時に弾く）。

```typescript
.superRefine((env, ctx) => {
  // 既存の GITHUB_PAT チェック...

  if (env.NODE_ENV !== "test" && !env.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DATABASE_URL is required when NODE_ENV is not 'test'",
      path: ["DATABASE_URL"],
    })
  }
})
```

### `apps/cron/src/repository/prisma/language-repository.ts`

```typescript
import type { PrismaClient } from "@repo/db"

export type LanguageDomain = {
  id: number
  name: string
  slug: string
}

export interface LanguageRepository {
  findBySlug: (slug: string) => Promise<LanguageDomain | null>
}

export class PrismaLanguageRepository implements LanguageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findBySlug = async (slug: string): Promise<LanguageDomain | null> => {
    const row = await this.prisma.language.findUnique({ where: { slug } })
    if (!row) return null
    return { id: row.id, name: row.name, slug: row.slug }
  }
}
```

### `apps/cron/src/repository/prisma/crawled-repo-repository.ts`

```typescript
import type { PrismaClient } from "@repo/db"

export type CrawledRepoDomain = {
  id: number
  commitSha: string
  fullName: string
  languageId: number
  license: string
  name: string
  owner: string
}

export type CreateCrawledRepoInput = {
  candidatesCount: number
  commitSha: string
  crawledAt: Date
  defaultBranch: string
  description: string | null
  disabled: boolean
  disabledReason: string | null
  fullName: string
  githubId: bigint
  homepage: string | null
  languageId: number
  license: string
  name: string
  owner: string
  stars: number
  storedCount: number
  topics: string[]
}

export interface CrawledRepoRepository {
  create: (input: CreateCrawledRepoInput) => Promise<CrawledRepoDomain>
  listForLicenseRecheck: () => Promise<CrawledRepoDomain[]>
  listRegisteredFullNames: (languageId: number) => Promise<Set<string>>
  markDisabled: (id: number, reason: string) => Promise<void>
}

export class PrismaCrawledRepoRepository implements CrawledRepoRepository {
  constructor(private readonly prisma: PrismaClient) {}
  // 実装は型に従う。listRegisteredFullNames は disabled の有無を問わず full_name を返す
  // （Search 結果から「再クロール候補から外す」用途）
}
```

### `apps/cron/src/repository/prisma/crawler-run-repository.ts`

```typescript
import type { PrismaClient } from "@repo/db"

export type CreateRunInput = {
  /** 例: "crawler_typescript" / "license_recheck"。task ごとにハードコードする（新言語追加時は "crawler_<slug>"） */
  runType: string
  startedAt: Date
}

export interface CrawlerRunRepository {
  /** 30 分以上前から running のままの行を failed に倒す。task の start() 直前で呼ぶ */
  markStaleAsFailed: (runType: string) => Promise<number>
  start: (input: CreateRunInput) => Promise<{ id: number }>
  succeed: (id: number, endedAt: Date, reposProcessed: number, problemsAdded: number) => Promise<void>
  fail: (id: number, endedAt: Date, error: unknown) => Promise<void>
}

export class PrismaCrawlerRunRepository implements CrawlerRunRepository { /* ... */ }
```

実行履歴の記録 + orphan running の救済を担う。本処理（problems / crawled_repos の書き込み）は `@@unique([languageId, astHash])` でべき等なので、二重起動防止は持たない。orphan running は `start()` のレスポンス喪失 / `succeed()` `fail()` の失敗 / OOM / SIGKILL のいずれかで発生し得るので、次回 run 冒頭の `markStaleAsFailed` で観測ノイズを掃除する。

### `apps/cron/src/repository/prisma/crawler-run-item-repository.ts`

```typescript
export type CreateRunItemInput = {
  crawlerRunId: number
  languageId: number
  startedAt: Date
  targetOwner: string
  targetRepo: string
}

export interface CrawlerRunItemRepository {
  start: (input: CreateRunItemInput) => Promise<{ id: number }>
  succeed: (id: number, endedAt: Date, problemsAdded: number) => Promise<void>
  fail: (id: number, endedAt: Date, error: unknown) => Promise<void>
  skip: (id: number, endedAt: Date, reason: string) => Promise<void>
  /** 同 owner/repo の直近 2 件が failed か（連続失敗判定） */
  countConsecutiveFailures: (targetOwner: string, targetRepo: string) => Promise<number>
}
```

### `apps/cron/src/repository/prisma/problem-repository.ts`

```typescript
export type CreateProblemInput = {
  astHash: string
  charCount: number
  codeBlock: string
  crawledRepoId: number
  functionName: string
  languageId: number
  lineCount: number
  sourceFilePath: string
  sourceLineStart: number
  sourceLineEnd: number
  sourceUrl: string
}

export interface ProblemRepository {
  /**
   * `@@unique([languageId, astHash])` 違反は skip し、挿入件数だけ返す。
   * Prisma の createMany({ skipDuplicates: true }) を使う。
   * 同 repo 内の重複は service 層で事前に Map dedupe するため、ここで弾かれるのは
   * 「他 repo に既に同 hash が存在する」ケースのみ
   */
  bulkCreateSkippingDuplicates: (inputs: CreateProblemInput[]) => Promise<number>
  /** ライセンス再検証で disabled になった repo の problems を一括無効化 */
  markDisabledByCrawledRepoId: (crawledRepoId: number) => Promise<number>
}
```

### `apps/cron/src/service/crawler/process-repo.ts`

processRepo() は **正常フロー上の分岐結果（disabled で記録、サンプリング成功）を plain union で返却、想定外エラー（API 5xx 3 回連続失敗、DB 障害）は throw**。`Result<T>` ラップしないのは、業務エラー（4xx 系）が出る場面が無いため。

```typescript
import * as ts from "typescript"

import { logger } from "@repo/logger"

import { checkAdoption } from "../../ast/adoption-check"
import { extractFunctions } from "../../ast/extract-functions"
import { astHashOf } from "../../ast/normalize-for-hash"
import { removeComments } from "../../ast/remove-comments"
import type { GithubClient, GithubRepoMeta } from "../../client/github"
import { GithubApiError } from "../../client/github"
import { retryWithBackoff } from "../../lib/retry"
import { buildSourceUrl } from "../../lib/source-url"

import type {
  CrawledRepoRepository,
  CreateCrawledRepoInput,
  CreateProblemInput,
  ProblemRepository,
} from "../../repository/prisma"

const MIN_ELIGIBLE = 30
const SAMPLE_CAP = 100
/** ファイルレベルのランダムサンプリング上限。巨大 repo の AST 走査コストを抑える */
const MAX_FETCH_FILES = 300
const ALLOWED_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"])

export type ProcessRepoTarget = {
  languageId: number
  name: string
  owner: string
}

export type ProcessRepoResult =
  | { adopted: true; candidatesCount: number; problemsAdded: number; storedCount: number }
  | { adopted: false; candidatesCount: number; reason: "fetch_timeout" | "license_not_allowed" | "too_few_problems" }

/**
 * `reason: "fetch_timeout"` は **巨大 repo（例: vscode 級）** で `listSourceFiles` の tree 取得が
 * `GITHUB_FETCH_TIMEOUT_MS` を超えてハングした場合のフォールバック分岐。
 * `GithubFetchTimeoutError` を catch して `disabled=true` / `disabledReason="fetch_timeout"` で
 * `crawled_repos` に記録し、次回以降のクロール対象から外す（再試行しない）。
 */

export type ProcessRepoDeps = {
  crawledRepoRepository: CrawledRepoRepository
  github: GithubClient
  problemRepository: ProblemRepository
}

export const processRepo = async (
  target: ProcessRepoTarget,
  deps: ProcessRepoDeps
): Promise<ProcessRepoResult> => {
  const fullName = `${target.owner}/${target.name}`
  logger.info("processRepo: start", { fullName })

  // 1. メタ取得（5xx は 3 回まで指数バックオフ、404 は throw して呼び出し側で記録）
  const meta = await retryWithBackoff(() => deps.github.getRepoMeta(target.owner, target.name))

  // 2. ライセンス確認
  if (meta.license === null || !ALLOWED_LICENSES.has(meta.license)) {
    await persistDisabled(target, meta, "license_not_allowed", deps, 0)
    return { adopted: false, candidatesCount: 0, reason: "license_not_allowed" }
  }

  // 3. ファイル一覧取得 + ファイルレベルのランダムサンプリング（pre-sampling）
  //    巨大 repo（数千ファイル）で AST 走査 + raw 取得のコストが線形に膨らむため、
  //    AST に通すファイル数を MAX_FETCH_FILES=300 件にランダム間引きする。
  //    関数の採用候補は MIN_ELIGIBLE=30 件 / SAMPLE_CAP=100 件で十分なため、
  //    全ファイルを走査する必要はない。
  const allFiles = await deps.github.listSourceFiles(target.owner, target.name, meta.commitSha)
  const files = allFiles.length > MAX_FETCH_FILES ? shuffle(allFiles).slice(0, MAX_FETCH_FILES) : allFiles

  // 4. 各ファイルから採用候補を抽出（repo 内重複は Map で事前 dedupe）
  const candidateMap = new Map<string, CreateProblemInput>()
  for (const file of files) {
    try {
      const raw = await deps.github.getRawContent(target.owner, target.name, meta.commitSha, file.path)
      const sf = ts.createSourceFile(file.path, raw, ts.ScriptTarget.Latest, true)
      for (const fn of extractFunctions(sf)) {
        const stripped = removeComments(fn.rawText)
        const adoption = checkAdoption(fn.functionName, stripped)
        if (!adoption.adopted) continue
        const hash = astHashOf(stripped)
        if (candidateMap.has(hash)) continue
        candidateMap.set(hash, {
          astHash: hash,
          charCount: adoption.charCount,
          codeBlock: stripped.trim(),
          crawledRepoId: 0,
          functionName: fn.functionName,
          languageId: target.languageId,
          lineCount: adoption.lineCount,
          sourceFilePath: file.path,
          sourceLineEnd: fn.sourceLineEnd,
          sourceLineStart: fn.sourceLineStart,
          sourceUrl: buildSourceUrl(target.owner, target.name, meta.commitSha, file.path, fn.sourceLineStart, fn.sourceLineEnd),
        })
      }
    } catch (err) {
      logger.warn("processRepo: file parse failed", { err: String(err), path: file.path })
    }
  }

  const candidates = Array.from(candidateMap.values())
  const candidatesCount = candidates.length

  // 5. repo 単位の足切り
  if (candidatesCount < MIN_ELIGIBLE) {
    await persistDisabled(target, meta, "too_few_problems", deps, candidatesCount)
    return { adopted: false, candidatesCount, reason: "too_few_problems" }
  }

  // 6. ランダムサンプリング（> 100 なら 100 件）
  const sampled = candidatesCount > SAMPLE_CAP ? shuffle(candidates).slice(0, SAMPLE_CAP) : candidates

  // 7. crawled_repos INSERT → problems bulkCreate
  const crawledRepo = await deps.crawledRepoRepository.create({
    candidatesCount,
    commitSha: meta.commitSha,
    crawledAt: new Date(),
    defaultBranch: meta.defaultBranch,
    description: meta.description,
    disabled: false,
    disabledReason: null,
    fullName: meta.fullName,
    githubId: BigInt(meta.id),
    homepage: meta.homepage,
    languageId: target.languageId,
    license: meta.license,
    name: meta.name,
    owner: meta.owner,
    stars: meta.stars,
    storedCount: sampled.length,
    topics: meta.topics,
  })

  const problemsWithRepoId = sampled.map((p) => ({ ...p, crawledRepoId: crawledRepo.id }))
  const problemsAdded = await deps.problemRepository.bulkCreateSkippingDuplicates(problemsWithRepoId)

  if (problemsAdded < sampled.length) {
    logger.info("processRepo: some problems skipped by cross-repo dedupe", {
      fullName,
      skipped: sampled.length - problemsAdded,
    })
  }

  logger.info("processRepo: done", { candidatesCount, fullName, problemsAdded })
  return { adopted: true, candidatesCount, problemsAdded, storedCount: sampled.length }
}

const persistDisabled = async (
  target: ProcessRepoTarget,
  meta: GithubRepoMeta,
  reason: string,
  deps: { crawledRepoRepository: CrawledRepoRepository },
  candidatesCount: number
): Promise<void> => {
  await deps.crawledRepoRepository.create({
    candidatesCount,
    commitSha: meta.commitSha,
    crawledAt: new Date(),
    defaultBranch: meta.defaultBranch,
    description: meta.description,
    disabled: true,
    disabledReason: reason,
    fullName: meta.fullName,
    githubId: BigInt(meta.id),
    homepage: meta.homepage,
    languageId: target.languageId,
    license: meta.license ?? "",
    name: meta.name,
    owner: meta.owner,
    stars: meta.stars,
    storedCount: 0,
    topics: meta.topics,
  })
}

const shuffle = <T>(arr: T[]): T[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
```

`retryWithBackoff` は step2 で実装済み（`statusCode >= 500` のときだけリトライ）。`GithubApiError` を返す `GithubClient.fetch` が 4xx をすぐ throw / 5xx をリトライ対象にする責務分担になっている。

### `apps/cron/src/service/crawler/pick-next-repo.ts`

```typescript
import type { GithubClient } from "../../client/github"

import type { CrawledRepoRepository } from "../../repository/prisma"

export const pickNextRepo = async (
  language: { id: number; slug: string },
  deps: { crawledRepoRepository: CrawledRepoRepository; github: GithubClient }
): Promise<{ name: string; owner: string } | null> => {
  const registered = await deps.crawledRepoRepository.listRegisteredFullNames(language.id)
  for (let page = 1; page <= 10; page++) {
    const result = await deps.github.searchRepos(language.slug, page)
    for (const item of result.items) {
      if (!registered.has(item.fullName)) {
        return { name: item.name, owner: item.owner }
      }
    }
    if (result.items.length < 100) break
  }
  return null
}
```

### `apps/cron/src/service/license/verifier.ts`

```typescript
import { logger } from "@repo/logger"

import type { GithubClient } from "../../client/github"
import { GithubApiError } from "../../client/github"
import { retryWithBackoff } from "../../lib/retry"

import type {
  CrawledRepoRepository,
  ProblemRepository,
} from "../../repository/prisma"

const ALLOWED_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"])

export type LicenseRecheckResult = {
  disabledProblems: number
  disabledRepos: number
  reposProcessed: number
}

export type LicenseRecheckDeps = {
  crawledRepoRepository: CrawledRepoRepository
  github: GithubClient
  problemRepository: ProblemRepository
}

export const licenseRecheck = async (deps: LicenseRecheckDeps): Promise<LicenseRecheckResult> => {
  const all = await deps.crawledRepoRepository.listForLicenseRecheck()
  let reposProcessed = 0
  let disabledRepos = 0
  let disabledProblems = 0
  for (const r of all) {
    try {
      const meta = await retryWithBackoff(() => deps.github.getRepoMeta(r.owner, r.name))
      if (meta.license === null || !ALLOWED_LICENSES.has(meta.license)) {
        await deps.crawledRepoRepository.markDisabled(r.id, "license_changed")
        const count = await deps.problemRepository.markDisabledByCrawledRepoId(r.id)
        disabledRepos++
        disabledProblems += count
        logger.warn("licenseRecheck: repo disabled", { count, fullName: r.fullName, license: meta.license })
      }
    } catch (err) {
      // 個別 repo の失敗（404 等）は他に影響させない
      logger.warn("licenseRecheck: failed to recheck", { err: String(err), fullName: r.fullName })
    }
    reposProcessed++
  }
  return { disabledProblems, disabledRepos, reposProcessed }
}
```

### `apps/cron/src/task/crawler-run-<slug>.ts`（言語別 task）

**言語ごとに 1 ファイル** で task を実装する。Phase 2 ローンチ時点では `crawler-run-typescript.ts` のみ。`LANGUAGE_SLUG = "typescript"` と `RUN_TYPE = "crawler_typescript"` を冒頭でハードコードし、`languageRepository.findBySlug(LANGUAGE_SLUG)` で言語を引いてから 1 言語ぶんのループを回す。

**`runtime/run-as-crawler-job.ts` 共通ラッパに集約する設計に変更**。task は `runAsCrawlerJob({ exec, runType, taskName })` パターンで、`markStaleAsFailed` → `start` → 本処理（`exec`）→ `succeed/fail` の定型処理 + graceful shutdown + Prisma client の生成・破棄 + top-level catch + `process.exit` までをラッパに寄せる。task ファイルは `exec` の中身（DI 組み立て + ループ）と冒頭の `LANGUAGE_SLUG` / `RUN_TYPE` ハードコードのみに集中する。`fail()` は nested try/catch で保護し、`fail` 自体が失敗しても元エラーを必ず rethrow する。

service の DI は `repo: { ...Repository }` と `client: { ...Client }` を別オブジェクトで渡すパターンに統一する（`pickNextRepo` / `processRepo` / `licenseRecheck` すべて同形）。

新言語を追加するときは `crawler-run-<slug>.ts` をコピーして `LANGUAGE_SLUG` / `RUN_TYPE` を変える + `processRepo` を言語固有の実装に差し替える（Go なら Go 用の AST extractor を使う `processRepoGo` を別途用意、JavaScript も将来は同パターン）。以下は TypeScript 版の例：

```typescript
import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { GithubClient } from "../client/github"
import { env } from "../env"
import {
  PrismaCrawledRepoRepository,
  PrismaCrawlerRunItemRepository,
  PrismaCrawlerRunRepository,
  PrismaLanguageRepository,
  PrismaProblemRepository,
} from "../repository/prisma"
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import { pickNextRepo } from "../service/crawler/pick-next-repo"
import { processRepo } from "../service/crawler/process-repo"

const LANGUAGE_SLUG = "typescript"
const RUN_TYPE = "crawler_typescript"

const main = async (): Promise<void> => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })
  const shutdownHandle = setupGracefulShutdown(prisma)

  const github = new GithubClient({ ... })
  const languageRepository = new PrismaLanguageRepository(prisma)
  const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
  const problemRepository = new PrismaProblemRepository(prisma)
  const crawlerRunRepository = new PrismaCrawlerRunRepository(prisma)
  const crawlerRunItemRepository = new PrismaCrawlerRunItemRepository(prisma)

  try {
    const lang = await languageRepository.findBySlug(LANGUAGE_SLUG)
    if (!lang) throw new Error(`language slug "${LANGUAGE_SLUG}" not found in DB`)

    /** orphan running の救済（前回 run が succeed/fail 到達前に死んだ場合） */
    const staleCount = await crawlerRunRepository.markStaleAsFailed(RUN_TYPE)
    if (staleCount > 0) logger.warn("crawler_run: stale running marked as failed", { staleCount })

    const { id: runId } = await crawlerRunRepository.start({ runType: RUN_TYPE, startedAt: new Date() })

    try {
      let reposProcessed = 0
      let problemsAdded = 0
      for (let i = 0; i < env.CRAWLER_REPOS_PER_RUN; i++) {
        if (shutdownHandle.isShuttingDown()) break
        const target = await pickNextRepo(lang, { crawledRepoRepository }, { github })
        if (!target) {
          logger.info("no more repos to process", { slug: LANGUAGE_SLUG })
          break
        }
        const item = await crawlerRunItemRepository.start({ ... })
        try {
          const result = await processRepo(
            { languageId: lang.id, name: target.name, owner: target.owner },
            { crawledRepoRepository, problemRepository },
            { github }
          )
          const added = result.adopted ? result.problemsAdded : 0
          await crawlerRunItemRepository.succeed(item.id, new Date(), added)
          reposProcessed++
          problemsAdded += added
        } catch (err) {
          // 部分失敗の継続: item に記録して次の repo へ
          logger.error("processRepo failed", err instanceof Error ? err : new Error(String(err)))
          await crawlerRunItemRepository.fail(item.id, new Date(), err)
          reposProcessed++
        }
      }
      await crawlerRunRepository.succeed(runId, new Date(), reposProcessed, problemsAdded)
    } catch (err) {
      // fail() が DB 障害で throw した場合は元エラーが消えるが、orphan は次回の markStaleAsFailed が回収
      await crawlerRunRepository.fail(runId, new Date(), err)
      throw err
    }
  } finally {
    if (!shutdownHandle.isShuttingDown()) await prisma.$disconnect()
  }
}

void main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error("crawler-run-typescript failed", err instanceof Error ? err : new Error(String(err)))
    process.exit(1)
  })
```

新言語（例: JavaScript）を追加するときはこのファイルをコピーして冒頭の定数を差し替える：

```typescript
const LANGUAGE_SLUG = "javascript"
const RUN_TYPE = "crawler_javascript"
```

（AST 抽出層が言語固有な場合は `processRepo` の差し替えも必要。Go 等。）

### `apps/cron/src/task/crawler-license-recheck.ts`

言語非依存（全 repo のライセンスを GitHub Repos API で一括再検証する）なので、`runType: "license_recheck"` の 1 つだけ。`crawler_run_items` は使わない（失敗 / 成功は logger.warn で十分）。構造は `crawler-run-typescript.ts` と同じパターン（最外 try / finally、run-level の fail() 保護、top-level catch）。

```typescript
const main = async (): Promise<void> => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })
  const shutdownHandle = setupGracefulShutdown(prisma)
  // ... DI を crawler-run-typescript.ts と同じく組み立て ...

  try {
    const staleCount = await crawlerRunRepository.markStaleAsFailed("license_recheck")
    if (staleCount > 0) logger.warn("crawler_run: stale running marked as failed", { staleCount })

    const { id: runId } = await crawlerRunRepository.start({
      runType: "license_recheck",
      startedAt: new Date(),
    })

    try {
      const result = await licenseRecheck(
        { crawledRepoRepository, problemRepository },
        { github }
      )
      // reposProcessed = 再検証 repo 数, problemsAdded = 無効化した problems 数（インパクト指標）
      await crawlerRunRepository.succeed(runId, new Date(), result.reposProcessed, result.disabledProblems)
    } catch (err) {
      try {
        await crawlerRunRepository.fail(runId, new Date(), err)
      } catch (failErr) {
        logger.error("crawlerRunRepository.fail failed", failErr instanceof Error ? failErr : new Error(String(failErr)))
      }
      throw err
    }
  } finally {
    if (!shutdownHandle.isShuttingDown()) await prisma.$disconnect()
  }
}

void main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error("crawler-license-recheck failed", err instanceof Error ? err : new Error(String(err)))
    process.exit(1)
  })
```

### ユニットテスト

step2 のテストに加えて、service 層のテストを追加：

| テストファイル | カバー範囲 |
| --- | --- |
| `test/service/crawler/process-repo.test.ts` | GithubClient を `vi.fn()` で mock、Repository も mock。「採用候補 30 未満で disabled / reason='too_few_problems'」「>= 30 で disabled=false / storedCount=保存件数 で INSERT」「> 100 で 100 件に絞る」「ライセンス NG で disabled / reason='license_not_allowed'」「repo 内同 hash dedupe」 |
| `test/service/crawler/pick-next-repo.test.ts` | Search mock + listRegisteredFullNames mock。「登録済みをスキップして次を返す」「全て登録済みで null」 |
| `test/service/license/verifier.test.ts` | 「ライセンス OK で何もしない」「NG で markDisabled + markDisabledByCrawledRepoId が呼ばれる」「個別 repo の 404 は他に影響させず継続」 |

**全テストは `describe("正常系", ...)` / `describe("異常系", ...)` で必ず分類する**（apps/api/CLAUDE.md 規約）。

## 動作確認

### ユニットテスト

```bash
pnpm --filter cron test
```

step2 のテスト + step3 の service テストが全て緑。

### ローカル 1 repo 処理

`.env.local` に `GITHUB_PAT` / `DATABASE_URL` を入れた上で：

```bash
CRAWLER_REPOS_PER_RUN=1 pnpm crawler:run:typescript
```

期待ログ：

```
processRepo: start, fullName=colinhacks/zod
processRepo: done, fullName=colinhacks/zod, problemsAdded=100
```

DB を psql で確認：

```sql
SELECT full_name, candidates_count, stored_count, disabled, disabled_reason FROM crawled_repos;
SELECT COUNT(*) FROM problems;
SELECT source_url FROM problems LIMIT 1;
SELECT run_type, status, repos_processed, problems_added FROM crawler_runs;
```

### 連続実行のべき等性

同日に 2 回連続実行 → 2 回目は `pickNextRepo` の登録済みスキップで「処理対象なし」になるか、新しい repo を 1 件追加して終了。`crawler_runs` には実行ごとに 1 行追加される。同じ AST hash の problem を再挿入しても `@@unique([languageId, astHash])` で防がれる。

### ライセンス再検証

```bash
pnpm crawler:license-recheck
```

license が変わった repo が `disabled=true` / `disabled_reason="license_changed"` になり、problems も無効化される。

### Graceful shutdown

`pnpm crawler:run:typescript` 実行中に Ctrl-C → `prisma.$disconnect()` がログに出てから exit code 130 で終了。

### Lint / Build / Type Check

```bash
pnpm --filter cron lint
pnpm --filter cron build
pnpm build
```

全て緑。
