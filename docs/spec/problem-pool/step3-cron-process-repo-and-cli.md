# step3: processRepo / CLI / crawler_runs と Sentry 連携

step1 の DB スキーマと step2 の GitHub クライアント + AST 解析を組み合わせ、`processRepo()` メイン関数、`pickNextRepo()`、`crawler_runs` での実行履歴管理、CLI エントリ（`pnpm crawler:run` / `pnpm crawler:license-recheck`）、Sentry 連携を実装する。**この step 完了で Phase 2 の機能要件が一通り揃う**。

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
  languageId: number
  githubId: bigint
  owner: string
  name: string
  fullName: string
  description: string | null
  homepage: string | null
  topics: string[]
  stars: number
  license: string
  defaultBranch: string
  commitSha: string
  eligible: boolean
  eligibleProblemCount: number
  disabled: boolean
  disabledReason: string | null
  crawledAt: Date
}

export interface CrawledRepoRepository {
  create(input: CreateCrawledRepoInput): Promise<CrawledRepoDomain>
  listRegisteredFullNames(languageId: number): Promise<Set<string>>
  listForLicenseRecheck(): Promise<CrawledRepoDomain[]>
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
  crawledRepoId: number
  sourceFilePath: string
  sourceLineStart: number
  sourceLineEnd: number
  sourceUrl: string
  functionName: string
  codeBlock: string
  charCount: number
  lineCount: number
  astHash: string
}

export interface ProblemRepository {
  /**
   * UNIQUE 制約（astHash）に違反した行は skip して挿入件数だけ返す。
   * createMany の skipDuplicates: true を使うか、 catch P2002 で個別に skip。
   */
  bulkCreateSkippingDuplicates(inputs: CreateProblemInput[]): Promise<number>
}
```

#### `crawler-run-repository.ts`

```typescript
export type CreateRunInput = {
  runType: "full" | "license_recheck"
  startedAt: Date
}

export interface CrawlerRunRepository {
  existsRunningOrSuccessToday(runType: string): Promise<boolean>
  start(input: CreateRunInput): Promise<{ id: number }>
  succeed(id: number, reposProcessed: number, problemsAdded: number): Promise<void>
  fail(id: number, error: unknown): Promise<void>
}
```

「同日」は **JST 00:00 起点**で判定。

### `apps/cron/src/types/domain/`

```typescript
// crawled-repo.ts
export type CrawledRepoDomain = {
  id: number
  languageId: number
  fullName: string
  owner: string
  name: string
  license: string
  commitSha: string
  /** ... */
}
```

### `apps/cron/src/service/process-repo.ts`

```typescript
import { Result, ok, err, conflictError } from "@repo/errors"
import { logger } from "@repo/logger"

import * as github from "../client/github"
import { extractFunctions } from "../ast/extract-functions"
import { stripComments } from "../ast/strip-comments"
import { checkAdoption } from "../ast/adoption-check"
import { astHashOf } from "../ast/normalize-for-hash"
import { buildSourceUrl } from "../lib/source-url"
import { retryWithBackoff } from "../lib/retry"

import type { CrawledRepoRepository, CreateCrawledRepoInput } from "../repository/prisma/crawled-repo-repository"
import type { ProblemRepository, CreateProblemInput } from "../repository/prisma/problem-repository"

const MIN_ELIGIBLE = 30
const SAMPLE_CAP = 100

export type ProcessRepoTarget = {
  languageId: number
  owner: string
  name: string
}

export type ProcessRepoResult =
  | { ok: true; problemsAdded: number; eligible: boolean }
  | { ok: false; reason: string }

export const processRepo = async (
  target: ProcessRepoTarget,
  repo: {
    crawledRepoRepository: CrawledRepoRepository
    problemRepository: ProblemRepository
  }
): Promise<Result<ProcessRepoResult>> => {
  logger.info("processRepo: start", { fullName: `${target.owner}/${target.name}` })

  /** 1. メタ取得 */
  const meta = await retryWithBackoff(
    () => github.getRepoMeta(target.owner, target.name),
    (e) => e instanceof github.GithubApiError && e.statusCode >= 500
  )

  /** 2. ライセンス確認 */
  if (!isAllowedLicense(meta.license)) {
    await persistDisabled(target, meta, "license_not_allowed", repo)
    return ok({ ok: false, reason: "license_not_allowed" })
  }

  /** 3. ファイル一覧取得 */
  const files = await github.listSourceFiles(target.owner, target.name, meta.commitSha)

  /** 4. 各ファイルから採用候補を抽出 */
  const candidates: CreateProblemInput[] = []
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
        candidates.push({
          crawledRepoId: 0,  // INSERT 時に上書き
          sourceFilePath: file.path,
          sourceLineStart: fn.sourceLineStart,
          sourceLineEnd: fn.sourceLineEnd,
          sourceUrl: buildSourceUrl(target.owner, target.name, meta.commitSha, file.path, fn.sourceLineStart, fn.sourceLineEnd),
          functionName: fn.functionName,
          codeBlock: stripped.trim(),
          charCount: adoption.charCount,
          lineCount: adoption.lineCount,
          astHash: hash,
        })
      }
    } catch (e) {
      logger.warn("processRepo: file parse failed", { path: file.path, err: String(e) })
    }
  }

  /** 5. repo 単位の足切り */
  if (candidates.length < MIN_ELIGIBLE) {
    await persistDisabled(target, meta, "too_few_problems", repo, candidates.length)
    return ok({ ok: false, reason: "too_few_problems" })
  }

  /** 6. ランダムサンプリング（> 100 なら 100 個に絞る） */
  const sampled = candidates.length > SAMPLE_CAP ? shuffle(candidates).slice(0, SAMPLE_CAP) : candidates

  /** 7. transaction で crawled_repos + problems を INSERT */
  const crawledRepo = await repo.crawledRepoRepository.create({
    languageId: target.languageId,
    githubId: BigInt(meta.id),
    owner: meta.owner,
    name: meta.name,
    fullName: meta.fullName,
    description: meta.description,
    homepage: meta.homepage,
    topics: meta.topics,
    stars: meta.stars,
    license: meta.license!,
    defaultBranch: meta.defaultBranch,
    commitSha: meta.commitSha,
    eligible: true,
    eligibleProblemCount: candidates.length,
    disabled: false,
    disabledReason: null,
    crawledAt: new Date(),
  })

  const problemsWithRepoId = sampled.map((p) => ({ ...p, crawledRepoId: crawledRepo.id }))
  const inserted = await repo.problemRepository.bulkCreateSkippingDuplicates(problemsWithRepoId)

  logger.info("processRepo: done", { fullName: meta.fullName, problemsAdded: inserted })
  return ok({ ok: true, problemsAdded: inserted, eligible: true })
}

const isAllowedLicense = (spdx: string | null): boolean =>
  spdx !== null && ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"].includes(spdx)
```

`processRepo` は **業務エラー（disabled で記録）は ok で返却、想定外エラー（API 5xx 連続失敗、DB 障害）は throw** という `Result<T>` の方針（CLAUDE.md / `@repo/errors` の規約）。

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
export const runWithCrawlerRunTracking = async (
  runType: "full" | "license_recheck",
  repo: { crawlerRunRepository: CrawlerRunRepository },
  body: (runId: number) => Promise<{ reposProcessed: number; problemsAdded: number }>
): Promise<void> => {
  if (await repo.crawlerRunRepository.existsRunningOrSuccessToday(runType)) {
    logger.info("crawler_run: skipped, already exists today", { runType })
    return
  }
  const { id } = await repo.crawlerRunRepository.start({ runType, startedAt: new Date() })
  try {
    const result = await body(id)
    await repo.crawlerRunRepository.succeed(id, result.reposProcessed, result.problemsAdded)
  } catch (err) {
    await repo.crawlerRunRepository.fail(id, err)
    throw err
  }
}
```

### `apps/cron/src/service/license-recheck.ts`

```typescript
export const licenseRecheck = async (
  repo: {
    crawledRepoRepository: CrawledRepoRepository
  }
): Promise<{ reposProcessed: number; problemsAdded: 0 }> => {
  const all = await repo.crawledRepoRepository.listForLicenseRecheck()
  let processed = 0
  for (const r of all) {
    const meta = await retryWithBackoff(
      () => github.getRepoMeta(r.owner, r.name),
      (e) => e instanceof github.GithubApiError && e.statusCode >= 500
    )
    if (!isAllowedLicense(meta.license)) {
      await repo.crawledRepoRepository.markDisabled(r.id, "license_changed")
    }
    processed++
  }
  return { reposProcessed: processed, problemsAdded: 0 }
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

  try {
    await runWithCrawlerRunTracking("full", { crawlerRunRepository }, async () => {
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
          const result = await processRepo(
            { languageId: lang.id, owner: target.owner, name: target.name },
            { crawledRepoRepository, problemRepository }
          )
          reposProcessed++
          if (result.ok && result.value.ok) problemsAdded += result.value.problemsAdded
        }
      }
      return { reposProcessed, problemsAdded }
    })
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
| `service/process-repo.test.ts` | GitHub API クライアントを `vi.fn()` で mock、Repository も mock。「採用候補 30 個未満で disabled」「>= 30 で eligible=true で INSERT」「> 100 で 100 件に絞る」「ライセンス NG で disabled」の正常 / 異常系 |
| `service/pick-next-repo.test.ts` | Search API mock + listRegisteredFullNames mock。「登録済みをスキップして次を返す」「全て登録済みで null」 |
| `service/crawler-run.test.ts` | 「同日 running あればスキップ」「成功で succeed」「例外で fail + rethrow」 |
| `service/license-recheck.test.ts` | 「ライセンス OK で何もしない」「NG で markDisabled が呼ばれる」 |

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
