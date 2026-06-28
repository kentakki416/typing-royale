import { logger } from "@repo/logger"

import { createGoExtractor } from "../ast/go-function-extractor"
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

const LANGUAGE_SLUG = "go"
const RUN_TYPE = "crawler_go"
const TASK_NAME = "crawler-run-go"

/**
 * Go の tree からダウンロードしない（≒ AST 解析対象外）のパスパターン。
 * vendor / テスト / 生成コード / testdata を弾く（GithubClient のデフォルトは TS/JS 向け）。
 */
const GO_EXCLUDED_PATTERNS = [
  /^vendor\//,
  /\/vendor\//,
  /_test\.go$/,
  /\.pb\.go$/,
  /_gen\.go$/,
  /^(testdata|examples?)\//,
  /\/(testdata|examples?)\//,
]

/**
 * crawler:run:go - Go 用週次クローラの起動エントリ。
 *
 * GitHub Search を `language:go` で叩き、processRepo に通して problems に保存する。
 * AST 抽出は tree-sitter-go（WASM）を使う GoFunctionExtractor を DI する。wasm ロードが
 * 非同期なため task 冒頭で createGoExtractor を 1 度だけ await して使い回す。
 *
 * shutdown 受信時はループ先頭で `signal.aborted` を確認して途中で抜ける。
 * 進行中の run は crawler_runs.status=running のまま残るが、次回 run の冒頭で
 * markStaleAsFailed が 30 分以上前の running を failed に倒すので観測ノイズは解消される。
 * 問題プール（problems / crawled_repos）はべき等な書き込みなので壊れない。
 */
runAsCrawlerJob({
  exec: async ({ prisma, runId, signal }) => {
    const github = new GithubClient({
      excludedPathPatterns: GO_EXCLUDED_PATTERNS,
      fetchTimeoutMs: env.GITHUB_FETCH_TIMEOUT_MS,
      minStars: env.CRAWLER_MIN_STARS,
      pat: env.GITHUB_PAT,
      pushedAfter: env.CRAWLER_PUSHED_AFTER,
      targetExtensions: /\.go$/,
    })
    const languageRepository = new PrismaLanguageRepository(prisma)
    const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
    const problemRepository = new PrismaProblemRepository(prisma)
    const crawlerRunItemRepository = new PrismaCrawlerRunItemRepository(prisma)
    /** tree-sitter-go の wasm ロードは非同期。1 度だけ初期化してループで共有する */
    const extractor = await createGoExtractor()

    const lang = await languageRepository.findBySlug(LANGUAGE_SLUG)
    if (!lang) {
      throw new Error(`language slug "${LANGUAGE_SLUG}" not found in DB`)
    }

    let reposProcessed = 0
    let problemsAdded = 0
    for (let i = 0; i < env.CRAWLER_REPOS_PER_RUN; i++) {
      /** ループ先頭で shutdown を確認し、協調的に中断する */
      if (signal.aborted) break

      const target = await pickNextRepo(lang, { crawledRepoRepository }, { github })
      if (!target) {
        logger.info("no more repos to process", { slug: LANGUAGE_SLUG })
        break
      }

      /** DB: CrawlerRunItem に問題抽出対象の Git Repository を記録 */
      const item = await crawlerRunItemRepository.start({
        crawlerRunId: runId,
        languageId: lang.id,
        startedAt: new Date(),
        targetOwner: target.owner,
        targetRepo: target.name,
      })

      try {
        /** Git Repository から関数を抽出して、DB:Problem に保存 */
        const result = await processRepo(
          { languageId: lang.id, name: target.name, owner: target.owner },
          { crawledRepoRepository, problemRepository },
          { github },
          extractor
        )
        const added = result.adopted ? result.problemsAdded : 0
        await crawlerRunItemRepository.succeed(item.id, new Date(), added)
        reposProcessed++
        problemsAdded += added
      } catch (err) {
        /** 部分失敗の継続：item に記録して次の repo へ */
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
