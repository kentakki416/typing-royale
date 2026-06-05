# step3: processRepo / task エントリ / crawler_runs 連携と Sentry

step1 の DB スキーマ（`crawler_runs` + `crawler_run_items` の親子、`Problem.languageId` 非正規化、`@@unique([languageId, astHash])`）と step2 の `GithubClient` + AST モジュールを組み合わせ、`processRepo()` / `pickNextRepo()` / run 追跡 / ライセンス再検証 / task エントリ（`pnpm crawler:run` / `pnpm crawler:license-recheck`）と Sentry 連携を実装する。**この step 完了で Phase 2 の機能要件が一通り揃う**。

## 設計方針

- **`task/` と `service/<domain>/` で分離**（[`apps/cron/README.md#ディレクトリ戦略`](../../../apps/cron/README.md#ディレクトリ戦略) 準拠）
  - `task/<name>.ts` は env 組み立て + DI + graceful shutdown だけの薄い 1 ファイル
  - 業務ロジックは `service/<domain>/` に集約し、task 横断で再利用可能にする
- **`GithubClient` は task 側で `new` してから service に DI**。service は env を直接読まない
- **部分失敗の継続**: メインループで repo 単位の try-catch、1 件の失敗が次の repo を止めない
- **`Result<T>` の使い方**: 業務エラー = `err(...)`、想定外 = throw（apps/api 規約と一致）。`processRepo` は disabled で記録するだけの正常フローも含むので `Promise<ProcessRepoResult>` の plain union を返す（`Result` ラップは不要）
- **二重起動防止**: 同日（JST 00:00 起点）の active run があれば skip。ただし stale running（30 分以上前から `running` のまま）は自動 `failed` 遷移してから新 run を開始
- **`CRAWLER_FORCE_RERUN=true`**: 開発者のローカル再実行用に同日チェックをバイパス

## 配置するファイル一覧

```
apps/cron/src/
├── task/
│   ├── crawler-run.ts                    # 本実装（既存の雛形を差し替え）
│   └── crawler-license-recheck.ts        # 本実装（既存の雛形を差し替え）
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
    │   ├── pick-next-repo.ts             # pickNextRepo()
    │   └── run-tracker.ts                # runWithCrawlerRunTracking()
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
    "@sentry/node":     "^8.0.0",
    "typescript":       "^5.9.3",
    "zod":              "^3.25.76"
  }
}
```

### `apps/cron/src/env.ts` に DATABASE_URL 必須化を追記

step2 では optional だった `DATABASE_URL` を、`NODE_ENV !== "test"` のとき必須にする（task が DB なしで起動できないことを起動時に弾く）。

```typescript
.superRefine((env, ctx) => {
  // 既存の GITHUB_PAT / SENTRY_DSN チェック...

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
  runType: "full" | "license_recheck"
  startedAt: Date
}

export interface CrawlerRunRepository {
  /** 同日（JST 00:00 起点）に status="running" / "success" の行があるか */
  existsActiveRunToday: (runType: string, now: Date) => Promise<boolean>
  /** started_at < now - 30min の running 行を failed に一括更新 */
  markStaleAsFailed: (runType: string, now: Date) => Promise<number>
  start: (input: CreateRunInput) => Promise<{ id: number }>
  succeed: (id: number, endedAt: Date, reposProcessed: number, problemsAdded: number) => Promise<void>
  fail: (id: number, endedAt: Date, error: unknown) => Promise<void>
}

export class PrismaCrawlerRunRepository implements CrawlerRunRepository { /* ... */ }
```

「同日」は **JST 00:00 起点**で判定。`now` を引数で渡す形にしてテストから clock を DI できるようにする。

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
const ALLOWED_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"])

export type ProcessRepoTarget = {
  languageId: number
  name: string
  owner: string
}

export type ProcessRepoResult =
  | { adopted: true; candidatesCount: number; problemsAdded: number; storedCount: number }
  | { adopted: false; candidatesCount: number; reason: "license_not_allowed" | "too_few_problems" }

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

  // 3. ファイル一覧取得
  const files = await deps.github.listSourceFiles(target.owner, target.name, meta.commitSha)

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

### `apps/cron/src/service/crawler/run-tracker.ts`

```typescript
import { logger } from "@repo/logger"

import type { CrawlerRunRepository } from "./crawler-run-repository"

export type RunWithCrawlerRunTrackingOptions = {
  forceRerun?: boolean
  /** テスト時に固定時刻を渡せるよう DI */
  now?: () => Date
}

export const runWithCrawlerRunTracking = async (
  runType: "full" | "license_recheck",
  deps: { crawlerRunRepository: CrawlerRunRepository },
  body: (runId: number) => Promise<{ problemsAdded: number; reposProcessed: number }>,
  options: RunWithCrawlerRunTrackingOptions = {}
): Promise<void> => {
  const now = options.now ?? (() => new Date())

  // 1. stale running を自動 failed 化（前回 SIGKILL / OOM の救済）
  const staleCount = await deps.crawlerRunRepository.markStaleAsFailed(runType, now())
  if (staleCount > 0) logger.warn("crawler_run: stale running marked as failed", { runType, staleCount })

  // 2. 同日チェック（CRAWLER_FORCE_RERUN=true ならバイパス）
  if (!options.forceRerun) {
    const exists = await deps.crawlerRunRepository.existsActiveRunToday(runType, now())
    if (exists) {
      logger.info("crawler_run: skipped, active run exists today", { runType })
      return
    }
  }

  const { id } = await deps.crawlerRunRepository.start({ runType, startedAt: now() })

  try {
    const result = await body(id)
    await deps.crawlerRunRepository.succeed(id, now(), result.reposProcessed, result.problemsAdded)
  } catch (err) {
    await deps.crawlerRunRepository.fail(id, now(), err)
    throw err
  }
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

### `apps/cron/src/task/crawler-run.ts`（既存の雛形を本実装に差し替え）

```typescript
import * as Sentry from "@sentry/node"

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
import { pickNextRepo } from "../service/crawler/pick-next-repo"
import { processRepo } from "../service/crawler/process-repo"
import { runWithCrawlerRunTracking } from "../service/crawler/run-tracker"

Sentry.init({ dsn: env.SENTRY_DSN, enabled: env.NODE_ENV === "production" })

const main = async (): Promise<void> => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })

  // Graceful shutdown: ECS Scheduled Task は SIGTERM、ローカルは SIGINT
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.warn("shutdown initiated", { signal })
    try { await prisma.$disconnect() } catch (err) {
      logger.error("prisma disconnect failed during shutdown", { err: String(err) })
    }
    process.exit(signal === "SIGTERM" ? 0 : 130)
  }
  process.on("SIGTERM", (signal) => void shutdown(signal))
  process.on("SIGINT", (signal) => void shutdown(signal))

  const github = new GithubClient({
    pat: env.GITHUB_PAT,
    minStars: env.CRAWLER_MIN_STARS,
    pushedAfter: env.CRAWLER_PUSHED_AFTER,
  })
  const languageRepository = new PrismaLanguageRepository(prisma)
  const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
  const problemRepository = new PrismaProblemRepository(prisma)
  const crawlerRunRepository = new PrismaCrawlerRunRepository(prisma)
  const crawlerRunItemRepository = new PrismaCrawlerRunItemRepository(prisma)

  try {
    await runWithCrawlerRunTracking(
      "full",
      { crawlerRunRepository },
      async (runId) => {
        let reposProcessed = 0
        let problemsAdded = 0
        for (const slug of env.CRAWLER_LANGUAGES.split(",")) {
          const lang = await languageRepository.findBySlug(slug.trim())
          if (!lang) {
            logger.warn("language not found", { slug })
            continue
          }
          for (let i = 0; i < env.CRAWLER_REPOS_PER_RUN; i++) {
            if (shuttingDown) break
            const target = await pickNextRepo(lang, { crawledRepoRepository, github })
            if (!target) {
              logger.info("no more repos to process", { slug })
              break
            }
            const itemStartedAt = new Date()
            const item = await crawlerRunItemRepository.start({
              crawlerRunId: runId,
              languageId: lang.id,
              startedAt: itemStartedAt,
              targetOwner: target.owner,
              targetRepo: target.name,
            })
            try {
              const result = await processRepo(
                { languageId: lang.id, name: target.name, owner: target.owner },
                { crawledRepoRepository, github, problemRepository }
              )
              const added = result.adopted ? result.problemsAdded : 0
              await crawlerRunItemRepository.succeed(item.id, new Date(), added)
              reposProcessed++
              problemsAdded += added
            } catch (err) {
              // 部分失敗の継続: item に記録して次の repo へ
              Sentry.captureException(err)
              logger.error("processRepo failed", { err: String(err), fullName: `${target.owner}/${target.name}` })
              await crawlerRunItemRepository.fail(item.id, new Date(), err)
              reposProcessed++
            }
          }
        }
        return { problemsAdded, reposProcessed }
      },
      { forceRerun: env.CRAWLER_FORCE_RERUN }
    )
  } catch (err) {
    Sentry.captureException(err)
    logger.error("crawler-run failed", { err: String(err) })
    throw err
  } finally {
    if (!shuttingDown) await prisma.$disconnect()
  }
}

void main().then(() => process.exit(0)).catch(() => process.exit(1))
```

### `apps/cron/src/task/crawler-license-recheck.ts`

`crawler-run.ts` と同型。`runType: "license_recheck"` で `licenseRecheck()` を呼ぶ。

```typescript
Sentry.init({ dsn: env.SENTRY_DSN, enabled: env.NODE_ENV === "production" })

const main = async (): Promise<void> => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })
  // ... graceful shutdown と DI を crawler-run.ts と同じく組み立て ...

  try {
    await runWithCrawlerRunTracking(
      "license_recheck",
      { crawlerRunRepository },
      async () => {
        const result = await licenseRecheck({ crawledRepoRepository, github, problemRepository })
        return { problemsAdded: result.disabledProblems, reposProcessed: result.reposProcessed }
      },
      { forceRerun: env.CRAWLER_FORCE_RERUN }
    )
  } catch (err) {
    Sentry.captureException(err)
    throw err
  } finally {
    if (!shuttingDown) await prisma.$disconnect()
  }
}
```

### ユニットテスト

step2 のテストに加えて、service 層のテストを追加：

| テストファイル | カバー範囲 |
| --- | --- |
| `test/service/crawler/process-repo.test.ts` | GithubClient を `vi.fn()` で mock、Repository も mock。「採用候補 30 未満で disabled / reason='too_few_problems'」「>= 30 で disabled=false / storedCount=保存件数 で INSERT」「> 100 で 100 件に絞る」「ライセンス NG で disabled / reason='license_not_allowed'」「repo 内同 hash dedupe」 |
| `test/service/crawler/pick-next-repo.test.ts` | Search mock + listRegisteredFullNames mock。「登録済みをスキップして次を返す」「全て登録済みで null」 |
| `test/service/crawler/run-tracker.test.ts` | clock を `now: () => new Date(...)` で DI。「同日 active あればスキップ」「stale running を自動 failed 化」「forceRerun=true でバイパス」「成功で succeed」「例外で fail + rethrow」 |
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
CRAWLER_REPOS_PER_RUN=1 pnpm crawler:run
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

### 二重起動防止

同日に 2 回連続実行 → 2 回目はスキップされ、`crawler_runs` に新規行が増えない。

### ライセンス再検証

```bash
pnpm crawler:license-recheck
```

license が変わった repo が `disabled=true` / `disabled_reason="license_changed"` になり、problems も無効化される。

### Graceful shutdown

`pnpm crawler:run` 実行中に Ctrl-C → `prisma.$disconnect()` がログに出てから exit code 130 で終了。

### Lint / Build / Type Check

```bash
pnpm --filter cron lint
pnpm --filter cron build
pnpm build
```

全て緑。
