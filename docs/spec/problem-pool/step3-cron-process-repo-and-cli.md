# step3: processRepo / CLI / crawler_runs と Sentry 連携

step1 の DB スキーマ（`crawler_runs` + `crawler_run_items` の親子構造、`Problem.languageId` 非正規化、`@@unique([languageId, astHash])`）と step2 の GitHub クライアント + AST 解析を組み合わせ、`processRepo()` メイン関数、`pickNextRepo()`、run 全体と repo 個別履歴の二段記録、CLI エントリ（`pnpm crawler:run` / `pnpm crawler:license-recheck`）、Sentry 連携を実装する。**この step 完了で Phase 2 の機能要件が一通り揃う**。

主な設計方針：

- **部分失敗の継続**: メインループで repo 単位の try-catch、1 件の失敗が次の repo を止めない
- **`Result<T>` の使い方**: 業務エラー = `err(...)`、想定外 = throw（apps/api 規約と一致）。`processRepo` は disabled で記録するだけの正常フローも含むので `Promise<ProcessRepoResult>` の plain union を返す（`Result` ラップは不要）
- **二重起動防止**: 同日（JST 00:00 起点）の active run があれば skip。ただし stale running（30 分以上前から `running` のまま）は自動 `failed` 遷移してから新 run を開始
- **`CRAWLER_FORCE_RERUN=true`**: 開発者のローカル再実行用に同日チェックをバイパス

## 対応内容

### `apps/cron/src/repository/prisma/` の各 Repository

レイヤードアーキテクチャ（apps/api/CLAUDE.md と同じ規約）に沿って Repository を作成。

#### `language-repository.ts`

```typescript
import type { PrismaClient } from "@repo/db"

export interface LanguageRepository {
  findBySlug(slug: string): Promise<{ id: number; slug: string; name: string } | null>
}

export class PrismaLanguageRepository implements LanguageRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findBySlug(slug: string) {
    return this.prisma.language.findUnique({ where: { slug } })
  }
}
```

#### `crawled-repo-repository.ts`

```typescript
import type { PrismaClient } from "@repo/db"

import type { CrawledRepoDomain } from "../../types/domain/crawled-repo"

export type CreateCrawledRepoInput = {
  candidatesCount: number
  commitSha: string
  crawledAt: Date
  defaultBranch: string
  description: string | null
  disabled: boolean
  disabledReason: string | null
  eligible: boolean
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
  create(input: CreateCrawledRepoInput): Promise<CrawledRepoDomain>
  listForLicenseRecheck(): Promise<CrawledRepoDomain[]>
  listRegisteredFullNames(languageId: number): Promise<Set<string>>
  markDisabled(id: number, reason: string): Promise<void>
}

export class PrismaCrawledRepoRepository implements CrawledRepoRepository {
  constructor(private readonly prisma: PrismaClient) {}
  /** ... */
}
```

#### `problem-repository.ts`

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
   * `@@unique([languageId, astHash])` に違反した行は skip し、挿入件数だけ返す。
   * Prisma の createMany({ skipDuplicates: true }) を使う。
   * 同 repo 内の重複は Service 層で事前に Map dedupe するため、ここで弾かれる
   * のは「他 repo に既に同 hash が存在する」ケースのみ
   */
  bulkCreateSkippingDuplicates(inputs: CreateProblemInput[]): Promise<number>
  /**
   * ライセンス再検証で disabled になった repo の problems を一括無効化
   */
  markDisabledByCrawledRepoId(crawledRepoId: number): Promise<number>
}
```

#### `crawler-run-repository.ts`

```typescript
export type CreateRunInput = {
  runType: "full" | "license_recheck"
  startedAt: Date
}

export interface CrawlerRunRepository {
  /**
   * 同日（JST 00:00 起点）に status="running" または status="success" のレコードが
   * 存在するか判定。CRAWLER_FORCE_RERUN=true 時は呼ばずに常に false 扱いにする
   */
  existsActiveRunToday(runType: string, now: Date): Promise<boolean>
  /**
   * `started_at < now() - 30min` の running 行を status="failed"、
   * error={ reason: "stale_running" } で一括更新。再起動後の救済
   */
  markStaleAsFailed(runType: string, now: Date): Promise<number>
  start(input: CreateRunInput): Promise<{ id: number }>
  succeed(id: number, endedAt: Date, reposProcessed: number, problemsAdded: number): Promise<void>
  fail(id: number, endedAt: Date, error: unknown): Promise<void>
}
```

「同日」は **JST 00:00 起点**で判定。`now` を引数で渡す形にすることでテストから clock を DI できる。

#### `crawler-run-item-repository.ts`

```typescript
export type CreateRunItemInput = {
  crawlerRunId: number
  languageId: number
  startedAt: Date
  targetOwner: string
  targetRepo: string
}

export interface CrawlerRunItemRepository {
  start(input: CreateRunItemInput): Promise<{ id: number }>
  succeed(id: number, endedAt: Date, problemsAdded: number): Promise<void>
  fail(id: number, endedAt: Date, error: unknown): Promise<void>
  skip(id: number, endedAt: Date, reason: string): Promise<void>
  /**
   * 連続 2 回失敗判定: 同一 targetOwner/targetRepo の直近 2 件が "failed" か
   */
  countConsecutiveFailures(targetOwner: string, targetRepo: string): Promise<number>
}
```

### `apps/cron/src/types/domain/`

```typescript
/** crawled-repo.ts */
export type CrawledRepoDomain = {
  id: number
  commitSha: string
  fullName: string
  languageId: number
  license: string
  name: string
  owner: string
  /** ... */
}
```

### `apps/cron/src/service/process-repo.ts`

```typescript
import * as ts from "typescript"

import { logger } from "@repo/logger"

import { astHashOf } from "../ast/normalize-for-hash"
import { checkAdoption } from "../ast/adoption-check"
import { extractFunctions } from "../ast/extract-functions"
import { stripComments } from "../ast/strip-comments"
import * as github from "../client/github"
import { buildSourceUrl } from "../lib/source-url"
import { retryWithBackoff } from "../lib/retry"

import type {
  CrawledRepoRepository,
  CreateCrawledRepoInput,
} from "../repository/prisma/crawled-repo-repository"
import type {
  CreateProblemInput,
  ProblemRepository,
} from "../repository/prisma/problem-repository"

const MIN_ELIGIBLE = 30
const SAMPLE_CAP = 100

const ALLOWED_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"])

export type ProcessRepoTarget = {
  languageId: number
  name: string
  owner: string
}

/**
 * 全て正常フロー上の分岐結果（業務エラーではない）。
 * Result でラップせず plain union を返す。
 * 想定外（API 5xx 3 回連続、DB 障害）は throw する
 */
export type ProcessRepoResult =
  | { eligible: true; problemsAdded: number; candidatesCount: number; storedCount: number }
  | { eligible: false; reason: "license_not_allowed" | "too_few_problems"; candidatesCount: number }

export const processRepo = async (
  target: ProcessRepoTarget,
  repo: {
    crawledRepoRepository: CrawledRepoRepository
    problemRepository: ProblemRepository
  }
): Promise<ProcessRepoResult> => {
  const fullName = `${target.owner}/${target.name}`
  logger.info("processRepo: start", { fullName })

  /** 1. メタ取得（5xx は 3 回まで指数バックオフ、404 は throw して呼び出し側で disable 記録） */
  const meta = await retryWithBackoff(
    () => github.getRepoMeta(target.owner, target.name),
    (e) => e instanceof github.GithubApiError && e.statusCode >= 500
  )

  /** 2. ライセンス確認 */
  if (meta.license === null || !ALLOWED_LICENSES.has(meta.license)) {
    await persistDisabled(target, meta, "license_not_allowed", repo, 0)
    return { candidatesCount: 0, eligible: false, reason: "license_not_allowed" }
  }

  /** 3. ファイル一覧取得 */
  const files = await github.listSourceFiles(target.owner, target.name, meta.commitSha)

  /** 4. 各ファイルから採用候補を抽出（repo 内重複は Map で事前 dedupe） */
  const candidateMap = new Map<string, CreateProblemInput>()
  for (const file of files) {
    try {
      const raw = await github.getRawContent(target.owner, target.name, meta.commitSha, file.path)
      const sf = ts.createSourceFile(file.path, raw, ts.ScriptTarget.Latest, true)
      const functions = extractFunctions(sf)
      for (const fn of functions) {
        const stripped = stripComments(fn.rawText)
        const adoption = checkAdoption(fn.functionName, stripped)
        if (!adoption.adopted) continue
        const hash = astHashOf(stripped)
        /** repo 内の同 hash は最初の 1 件だけ採用（in-repo dedupe） */
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
          sourceUrl: buildSourceUrl(
            target.owner,
            target.name,
            meta.commitSha,
            file.path,
            fn.sourceLineStart,
            fn.sourceLineEnd
          ),
        })
      }
    } catch (e) {
      logger.warn("processRepo: file parse failed", { err: String(e), path: file.path })
    }
  }

  const candidates = Array.from(candidateMap.values())
  const candidatesCount = candidates.length

  /** 5. repo 単位の足切り */
  if (candidatesCount < MIN_ELIGIBLE) {
    await persistDisabled(target, meta, "too_few_problems", repo, candidatesCount)
    return { candidatesCount, eligible: false, reason: "too_few_problems" }
  }

  /** 6. ランダムサンプリング（> 100 なら 100 個に絞る） */
  const sampled = candidatesCount > SAMPLE_CAP ? shuffle(candidates).slice(0, SAMPLE_CAP) : candidates

  /** 7. crawled_repos INSERT → problems bulkCreate（dedup は @@unique で他 repo 重複を弾く） */
  const crawledRepo = await repo.crawledRepoRepository.create({
    candidatesCount,
    commitSha: meta.commitSha,
    crawledAt: new Date(),
    defaultBranch: meta.defaultBranch,
    description: meta.description,
    disabled: false,
    disabledReason: null,
    eligible: true,
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
  const problemsAdded = await repo.problemRepository.bulkCreateSkippingDuplicates(problemsWithRepoId)

  /** storedCount と実際の挿入件数がズレた場合（他 repo に同 hash が既存）の警告 */
  if (problemsAdded < sampled.length) {
    logger.info("processRepo: some problems skipped by cross-repo dedupe", {
      fullName,
      skipped: sampled.length - problemsAdded,
    })
  }

  logger.info("processRepo: done", { candidatesCount, fullName, problemsAdded })
  return { candidatesCount, eligible: true, problemsAdded, storedCount: sampled.length }
}

const persistDisabled = async (
  target: ProcessRepoTarget,
  meta: github.GithubRepoMeta,
  reason: string,
  repo: { crawledRepoRepository: CrawledRepoRepository },
  candidatesCount: number
): Promise<void> => {
  await repo.crawledRepoRepository.create({
    candidatesCount,
    commitSha: meta.commitSha,
    crawledAt: new Date(),
    defaultBranch: meta.defaultBranch,
    description: meta.description,
    disabled: true,
    disabledReason: reason,
    eligible: false,
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

`processRepo` は **正常フロー上の分岐結果（disabled で記録、サンプリング成功）を plain union で返却、想定外エラー（API 5xx 3 回連続失敗、DB 障害）は throw**。`Result<T>` でラップしないのは、業務エラー（4xx 系）を表現する場面が無いため（apps/api 規約に従う：業務エラーがあるときだけ `Result` を使う）。

### `apps/cron/src/service/pick-next-repo.ts`

```typescript
export const pickNextRepo = async (
  language: { id: number; slug: string },
  repo: { crawledRepoRepository: CrawledRepoRepository }
): Promise<{ owner: string; name: string } | null> => {
  const registered = await repo.crawledRepoRepository.listRegisteredFullNames(language.id)
  for (let page = 1; page <= 10; page++) {
    const result = await searchRepos(language.slug, page)
    for (const item of result.items) {
      if (!registered.has(item.fullName)) {
        return { owner: item.owner, name: item.name }
      }
    }
    if (result.items.length < 100) break
  }
  return null
}
```

### `apps/cron/src/service/crawler-run.ts`

```typescript
import { logger } from "@repo/logger"

import type { CrawlerRunRepository } from "../repository/prisma/crawler-run-repository"

export type RunWithCrawlerRunTrackingOptions = {
  forceRerun?: boolean
  /** clock を DI（テスト時に固定時刻を渡す） */
  now?: () => Date
}

/**
 * crawler_runs の status="running" を立ててから body を実行し、終了時に success/failed を記録する。
 * 二重起動防止と stale running の自動解放を兼ねる。
 */
export const runWithCrawlerRunTracking = async (
  runType: "full" | "license_recheck",
  repo: { crawlerRunRepository: CrawlerRunRepository },
  body: (runId: number) => Promise<{ problemsAdded: number; reposProcessed: number }>,
  options: RunWithCrawlerRunTrackingOptions = {}
): Promise<void> => {
  const now = options.now ?? (() => new Date())

  /** 1. stale running を自動的に failed に遷移（前回 SIGKILL / OOM 等の救済） */
  const staleCount = await repo.crawlerRunRepository.markStaleAsFailed(runType, now())
  if (staleCount > 0) {
    logger.warn("crawler_run: stale running marked as failed", { runType, staleCount })
  }

  /** 2. 同日チェック（CRAWLER_FORCE_RERUN=true ならバイパス） */
  if (!options.forceRerun) {
    const exists = await repo.crawlerRunRepository.existsActiveRunToday(runType, now())
    if (exists) {
      logger.info("crawler_run: skipped, active run exists today", { runType })
      return
    }
  }

  const { id } = await repo.crawlerRunRepository.start({ runType, startedAt: now() })

  try {
    const result = await body(id)
    await repo.crawlerRunRepository.succeed(id, now(), result.reposProcessed, result.problemsAdded)
  } catch (err) {
    await repo.crawlerRunRepository.fail(id, now(), err)
    throw err
  }
}
```

`existsActiveRunToday` / `markStaleAsFailed` は **JST 00:00 起点**で判定する Repository 実装。`now` は引数で受け取るので、テストでは `vi.fn(() => new Date("2026-06-05T03:00:00+09:00"))` のように clock を DI できる。

### `apps/cron/src/service/license-recheck.ts`

```typescript
import { logger } from "@repo/logger"

import * as github from "../client/github"
import { retryWithBackoff } from "../lib/retry"

import type { CrawledRepoRepository } from "../repository/prisma/crawled-repo-repository"
import type { ProblemRepository } from "../repository/prisma/problem-repository"

const ALLOWED_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"])

export type LicenseRecheckResult = {
  /** 不適合になった repo の総数 */
  disabledRepos: number
  /** 一括無効化した problems の総件数 */
  disabledProblems: number
  /** 処理した repo の総数（再検証完了済み） */
  reposProcessed: number
}

export const licenseRecheck = async (
  repo: {
    crawledRepoRepository: CrawledRepoRepository
    problemRepository: ProblemRepository
  }
): Promise<LicenseRecheckResult> => {
  const all = await repo.crawledRepoRepository.listForLicenseRecheck()
  let reposProcessed = 0
  let disabledRepos = 0
  let disabledProblems = 0
  for (const r of all) {
    try {
      const meta = await retryWithBackoff(
        () => github.getRepoMeta(r.owner, r.name),
        (e) => e instanceof github.GithubApiError && e.statusCode >= 500
      )
      if (meta.license === null || !ALLOWED_LICENSES.has(meta.license)) {
        await repo.crawledRepoRepository.markDisabled(r.id, "license_changed")
        const count = await repo.problemRepository.markDisabledByCrawledRepoId(r.id)
        disabledRepos++
        disabledProblems += count
        logger.warn("licenseRecheck: repo disabled", { count, fullName: r.fullName, license: meta.license })
      }
    } catch (err) {
      /** 個別 repo の失敗（404 等）は他に影響させないが、disabled には記録しない */
      logger.warn("licenseRecheck: failed to recheck", { err: String(err), fullName: r.fullName })
    }
    reposProcessed++
  }
  return { disabledProblems, disabledRepos, reposProcessed }
}
```

### `apps/cron/src/cli/crawler-run.ts`

```typescript
import * as Sentry from "@sentry/node"

import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { env } from "../env"
import { runWithCrawlerRunTracking } from "../service/crawler-run"
import { processRepo } from "../service/process-repo"
import { pickNextRepo } from "../service/pick-next-repo"
import {
  PrismaCrawledRepoRepository,
  PrismaCrawlerRunRepository,
  PrismaLanguageRepository,
  PrismaProblemRepository,
} from "../repository/prisma"

Sentry.init({ dsn: env.SENTRY_DSN, enabled: env.NODE_ENV === "production" })

const main = async () => {
  const prisma = createPrismaClient()

  /**
   * Graceful shutdown
   *
   * ECS Scheduled Task はタスクのタイムアウトや停止指示で SIGTERM を送る。
   * デフォルトで 30 秒以内に終了しないと SIGKILL されるため、DB コネクションだけは
   * 必ず閉じる。run の途中なら runWithCrawlerRunTracking 側の catch で
   * crawler_runs.status=failed に更新されるので、シグナルでは特別な記録はしない。
   *
   * Ctrl-C で止めるローカル開発者にも同じ挙動を提供する（SIGINT）。
   */
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.warn("shutdown initiated", { signal })
    try {
      await prisma.$disconnect()
    } catch (err) {
      logger.error("prisma disconnect failed during shutdown", { err: String(err) })
    }
    process.exit(signal === "SIGTERM" ? 0 : 130)
  }
  process.on("SIGTERM", (signal) => void shutdown(signal))
  process.on("SIGINT", (signal) => void shutdown(signal))

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
            const target = await pickNextRepo(lang, { crawledRepoRepository })
            if (!target) {
              logger.info("no more repos to process", { slug })
              break
            }
            /** repo 単位の try-catch で部分失敗を継続 */
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
                { crawledRepoRepository, problemRepository }
              )
              const added = result.eligible ? result.problemsAdded : 0
              await crawlerRunItemRepository.succeed(item.id, new Date(), added)
              reposProcessed++
              problemsAdded += added
            } catch (err) {
              /** 個別 repo の失敗は item に記録し、次の repo へ進む（部分失敗の継続） */
              Sentry.captureException(err)
              logger.error("processRepo failed", {
                err: String(err),
                fullName: `${target.owner}/${target.name}`,
              })
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

`license-recheck.ts` でも同じ SIGTERM / SIGINT ハンドラを設置する（CLI ごとに graceful shutdown が必要）。

### `apps/cron/src/cli/license-recheck.ts`

`crawler-run.ts` と同型。`runType: "license_recheck"` で `licenseRecheck` を実行。

### `apps/cron/package.json` の scripts 追加

```jsonc
{
  "scripts": {
    "build":   "tsc --project tsconfig.build.json",
    "dev":     "CRAWLER_REPOS_PER_RUN=1 dotenvx run -f .env.local -- tsx src/cli/crawler-run.ts",
    "crawler:run":             "dotenvx run -f .env.local -- tsx src/cli/crawler-run.ts",
    "crawler:license-recheck": "dotenvx run -f .env.local -- tsx src/cli/license-recheck.ts",
    "test":    "vitest run",
    "lint":    "eslint 'src/**/*.ts' 'test/**/*.ts'",
    "lint:fix":"eslint 'src/**/*.ts' 'test/**/*.ts' --fix"
  }
}
```

#### `pnpm dev` の意味

cron は **one-shot CLI** であり、長時間常駐するサーバではない。そのため `tsx watch`（ファイル変更で再起動）は **使わない**。ファイル変更ごとに GitHub API を叩いて DB に書き込んでしまうと、ローカル開発で意図せずレート制限に達したり、問題プールが汚れたりするため。

`pnpm dev` は **「ローカルで挙動を 1 度確認するための最小実行」** として定義する：

- `CRAWLER_REPOS_PER_RUN=1` を強制し、1 repo だけ処理して終了する
- 1 度実行したら `crawler_runs` の同日チェックで以降は skip される（再実行は前日の `success` 行を SQL で削除するか、`crawler:run` を直接叩く）

ルート `package.json` の `pnpm crawler:run` / `pnpm crawler:license-recheck` でも呼べるよう、turbo の workspace 連携経由で叩けることを確認。

#### 推奨 env

`apps/cron/.env.local.example`（step2 で作成）に以下を **ローカル既定** として記載：

```dotenv
LOGGER_TYPE=console     # JSON 1 行より目視しやすい
LOG_LEVEL=debug         # processRepo の進捗を細かく追える
CRAWLER_REPOS_PER_RUN=1 # 暴走防止
```

本番では `LOGGER_TYPE=pino` / `LOG_LEVEL=info` / `CRAWLER_REPOS_PER_RUN=1`。

### ユニットテスト

step2 のテストに加えて、Service 層のテストを追加：

| テストファイル | カバー範囲 |
|---|---|
| `service/process-repo.test.ts` | GitHub API クライアントを `vi.fn()` で mock、Repository も mock。「採用候補 30 個未満で disabled」「>= 30 で eligible=true で INSERT」「> 100 で 100 件に絞る」「ライセンス NG で disabled」「repo 内同 hash の dedupe（Map）」「他 repo に既存の hash で skipDuplicates が効く」 |
| `service/pick-next-repo.test.ts` | Search API mock + listRegisteredFullNames mock。「登録済みをスキップして次を返す」「全て登録済みで null」 |
| `service/crawler-run.test.ts` | clock を `now: () => new Date(...)` で DI。「同日 active あればスキップ」「stale running を自動 failed 化」「forceRerun=true で同日チェックバイパス」「成功で succeed」「例外で fail + rethrow」 |
| `service/license-recheck.test.ts` | 「ライセンス OK で何もしない」「NG で markDisabled + markDisabledByCrawledRepoId が呼ばれる」「個別 repo の 404 は他に影響させず継続」 |

**全テストは `describe("正常系", ...)` / `describe("異常系", ...)` で必ず分類する**（apps/api/CLAUDE.md 規約）。例として `process-repo.test.ts` のスケルトン：

```typescript
describe("processRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("採用候補 50 個でランダムサンプリングなし、全件保存される", async () => {
      /** ... */
    })

    it("採用候補 200 個でランダム 100 件に絞られ、storedCount=100", async () => {
      /** ... */
    })
  })

  describe("異常系", () => {
    it("ライセンスが GPL の場合 disabled=true / disabledReason='license_not_allowed' で記録", async () => {
      /** ... */
    })

    it("採用候補が 29 個の場合 disabled=true / disabledReason='too_few_problems'", async () => {
      /** ... */
    })

    it("repo 内に同 astHash が複数あっても 1 件だけ保存される", async () => {
      /** ... */
    })

    it("GitHub API が 5xx を 3 回返したら throw する", async () => {
      /** ... */
    })
  })
})
```

### TODO.md の更新

Phase 2 の残り項目をすべて `[x]` に：
- repo 単位の足切り
- `crawler_runs` への結果記録
- 失敗時のハンドリング
- `pickNextRepo()`
- CLI エントリポイント
- 月次ライセンス再検証
- Sentry 連携

## 動作確認

### ユニットテスト

```bash
pnpm --filter cron test
```

step2 の AST テスト + step3 の Service テストが全て緑。

### ローカル 1 repo 処理

`.env.local` に `GITHUB_PAT` を入れた上で：

```bash
pnpm crawler:run
```

期待出力（logger.info）：

```
processRepo: start, fullName=colinhacks/zod
processRepo: done, fullName=colinhacks/zod, problemsAdded=100
```

DB を psql で確認：

```sql
SELECT full_name, eligible, eligible_problem_count, disabled FROM crawled_repos;
-- → colinhacks/zod | t | (適切な値) | f

SELECT COUNT(*) FROM problems;
-- → ~100（採用候補数による）

SELECT source_url FROM problems LIMIT 1;
-- → https://github.com/colinhacks/zod/blob/<sha>/<path>#L<start>-L<end>

SELECT run_type, status, repos_processed, problems_added FROM crawler_runs;
-- → full | success | 1 | <数>
```

### ブートストラップ実行

```bash
CRAWLER_REPOS_PER_RUN=5 pnpm crawler:run
```

5 つの異なる repo が処理されることを確認。

### コメント除去後コードの目視確認

```sql
SELECT function_name, char_count, line_count, LEFT(code_block, 100) FROM problems LIMIT 5;
```

- コメントが含まれていない
- 100〜400 文字、5〜25 行に収まっている
- 非 ASCII 文字が含まれていない

### 失敗系の確認

`GITHUB_PAT` を無効値にして実行：

```bash
GITHUB_PAT=invalid pnpm crawler:run
```

→ `crawler_runs` に `failed` で記録される、Sentry（dev は disabled）には飛ばない、プロセスは exit code 1 で終了。

### Graceful shutdown（SIGTERM / SIGINT）

ローカルで `pnpm crawler:run` を実行中、processRepo の途中で **Ctrl-C** を押す：

```
^C
[2026-06-05 ...] WARN: shutdown initiated
    signal: "SIGINT"
[2026-06-05 ...] INFO: ...
```

期待挙動：

- `prisma.$disconnect()` がログに出てから exit code 130 で終了
- `crawler_runs` の該当行は `status=running` のままになる（catch 経由ではないため）。次回 run 時の同日チェックで `running` が見つかってスキップされるので、運用上は `psql` で手動で `status='failed'` に書き換えるか前日扱いにして再実行する
- SIGTERM のテストは `kill -TERM <pid>` で同様に確認可能（exit code 0）

### 二重起動防止

同日に 2 回連続実行 → 2 回目はスキップされ、`crawler_runs` には新規行が増えない（既存の `success` 行があるため）。

### ライセンス再検証

```bash
pnpm crawler:license-recheck
```

`crawled_repos` の license が変わっている repo（手動で license を書き換えてテスト）が `disabled=true`、`disabledReason="license_changed"` になる。

### Lint / Build / Type Check

```bash
pnpm --filter cron lint
pnpm --filter cron build
pnpm build  # ルートから全体
```

全て緑。
