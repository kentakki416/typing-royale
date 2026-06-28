# step1: JavaScript 用クローラ task

JavaScript の問題プールを埋める週次クローラ task を 1 本追加する。AST 抽出パイプラインは TypeScript 用と完全に共通なので、新規ロジックは書かず **`crawler-run-typescript.ts` の薄いコピー**を作る。

## 対応内容

### `apps/cron/src/task/crawler-run-javascript.ts`（新規）

`crawler-run-typescript.ts` をコピーし、以下の 3 定数と `targetExtensions` のみを変更する。それ以外（DI 構成・ループ・エラーハンドリング・shutdown 連携）は同一。

```ts
import { logger } from "@repo/logger"

import { GithubClient } from "../client/github"
import { env } from "../env"
import {
  PrismaCrawledRepoRepository,
  PrismaCrawlerRunItemRepository,
  PrismaLanguageRepository,
  PrismaProblemRepository,
} from "../repository/prisma"
import { runAsCrawlerJob } from "../runtime/run-as-crawler-job"
import { pickNextRepo } from "../service/crawler/pick-next-repo"
import { processRepo } from "../service/crawler/process-repo"

const LANGUAGE_SLUG = "javascript"
const RUN_TYPE = "crawler_javascript"
const TASK_NAME = "crawler-run-javascript"

/**
 * crawler:run:javascript - JavaScript 用週次クローラの起動エントリ。
 *
 * GitHub Search を `language:JavaScript` で叩き、processRepo に通して problems に保存する。
 * AST 抽出は TypeScript Compiler API をそのまま利用（.js/.mjs/.cjs は拡張子から
 * ScriptKind.JS が自動推定される）。TypeScript task と差分は LANGUAGE_SLUG /
 * RUN_TYPE / targetExtensions の 3 点のみ。
 */
runAsCrawlerJob({
  exec: async ({ prisma, runId, signal }) => {
    const github = new GithubClient({
      fetchTimeoutMs: env.GITHUB_FETCH_TIMEOUT_MS,
      minStars: env.CRAWLER_MIN_STARS,
      pat: env.GITHUB_PAT,
      pushedAfter: env.CRAWLER_PUSHED_AFTER,
      targetExtensions: /\.(js|mjs|cjs)$/,
    })
    const languageRepository = new PrismaLanguageRepository(prisma)
    const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
    const problemRepository = new PrismaProblemRepository(prisma)
    const crawlerRunItemRepository = new PrismaCrawlerRunItemRepository(prisma)

    const lang = await languageRepository.findBySlug(LANGUAGE_SLUG)
    if (!lang) {
      throw new Error(`language slug "${LANGUAGE_SLUG}" not found in DB`)
    }

    let reposProcessed = 0
    let problemsAdded = 0
    for (let i = 0; i < env.CRAWLER_REPOS_PER_RUN; i++) {
      if (signal.aborted) break

      const target = await pickNextRepo(lang, { crawledRepoRepository }, { github })
      if (!target) {
        logger.info("no more repos to process", { slug: LANGUAGE_SLUG })
        break
      }

      const item = await crawlerRunItemRepository.start({
        crawlerRunId: runId,
        languageId: lang.id,
        startedAt: new Date(),
        targetOwner: target.owner,
        targetRepo: target.name,
      })

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
        logger.error(
          "processRepo failed",
          err instanceof Error ? err : new Error(String(err)),
          { fullName: `${target.owner}/${target.name}` }
        )
        await crawlerRunItemRepository.fail(item.id, new Date(), err)
        reposProcessed++
      }
    }

    return { problemsAdded, reposProcessed }
  },
  runType: RUN_TYPE,
  taskName: TASK_NAME,
})
```

> **共通化の検討**：TypeScript task との差分が 3 定数 + 拡張子だけなので「言語をパラメータ化した 1 つの factory に集約」も選択肢になる。ただし `apps/cron/CLAUDE.md` は明示的に「言語ごとに `task/crawler-run-<slug>.ts` を 1 ファイルずつ作る」方針を採っている（1 言語の障害を他言語に波及させない・runType を静的に固定する意図）。本 step は **その方針に従いコピーで追加**する。Go 追加時に 3 言語目が出そろった段階で、共通部分を `runCrawler({ slug, runType, extensions })` に切り出すリファクタを別途検討する（[go-support](../go-support/README.md) と合わせて判断）。

### `apps/cron/package.json`（スクリプト追加）

```jsonc
{
  "scripts": {
    "crawler:run:typescript": "dotenvx run -f .env.local -- tsx src/task/crawler-run-typescript.ts",
    "crawler:run:javascript": "dotenvx run -f .env.local -- tsx src/task/crawler-run-javascript.ts"
  }
}
```

### `apps/cron/CLAUDE.md`（タスク表に 1 行追記）

「含まれるタスク」表に `pnpm crawler:run:javascript`（週次）を追加し、「現時点では TypeScript のみ」の記述を更新する。

## 動作確認

### ユニットテスト

AST パイプラインは既存テストでカバー済み。**JS 構文が TS Compiler API で正しく関数抽出されること**を担保する最小テストを `extract-functions` に追加する：

```ts
import { extractFunctions } from "../src/ast/extract-functions"
import * as ts from "typescript"

it("CommonJS の module.exports 関数を抽出する", () => {
  const src = `module.exports = function add(a, b) { return a + b }`
  const sf = ts.createSourceFile("sample.js", src, ts.ScriptTarget.Latest, true)
  const fns = extractFunctions(sf)
  expect(fns.map((f) => f.functionName)).toContain("add")
})

it(".mjs の export 関数を抽出する", () => {
  const src = `export const mul = (a, b) => a * b`
  const sf = ts.createSourceFile("sample.mjs", src, ts.ScriptTarget.Latest, true)
  const fns = extractFunctions(sf)
  expect(fns.map((f) => f.functionName)).toContain("mul")
})
```

### ローカル実行（実 GitHub）

```bash
cd apps/api && pnpm db:migrate   # JS 行は seed 済み migration に含まれる
cd apps/cron && CRAWLER_REPOS_PER_RUN=1 pnpm crawler:run:javascript

# JavaScript の problems が入ったことを確認
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "
  SELECT l.slug, count(*) FROM problems p
  JOIN languages l ON l.id = p.language_id
  GROUP BY l.slug;"

# crawler_runs に crawler_javascript が記録されたことを確認
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "
  SELECT run_type, status, repos_processed, problems_added FROM crawler_runs
  WHERE run_type = 'crawler_javascript';"
```

期待結果：`problems` に `javascript` 行が増え、`crawler_runs` に `crawler_javascript` の run が `success` で記録される。
</content>
