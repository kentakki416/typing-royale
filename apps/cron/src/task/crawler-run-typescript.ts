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

/**
 * crawler:run:typescript - TypeScript 用週次クローラの起動エントリ。
 *
 * GitHub Search を `language:TypeScript` で叩き、processRepo に通して problems に保存する。
 * AST 抽出は TypeScript Compiler API を直接利用（process-repo.ts 内部）。
 *
 * SIGTERM (ECS Scheduled Task) / SIGINT (Ctrl-C) で graceful shutdown：
 *   - 進行中の run は crawler_runs.status=running のまま残るが、次回 run の冒頭で
 *     markStaleAsFailed が 30 分以上前の running を failed に倒すので観測ノイズは解消される
 *   - 問題プール（problems / crawled_repos）はべき等な書き込みなので壊れない
 */
const main = async (): Promise<void> => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })
  const shutdownHandle = setupGracefulShutdown(prisma)

  const github = new GithubClient({
    pat: env.GITHUB_PAT,
    minStars: env.CRAWLER_MIN_STARS,
    pushedAfter: env.CRAWLER_PUSHED_AFTER,
    targetExtensions: /\.(ts|tsx)$/,
  })
  const languageRepository = new PrismaLanguageRepository(prisma)
  const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
  const problemRepository = new PrismaProblemRepository(prisma)
  const crawlerRunRepository = new PrismaCrawlerRunRepository(prisma)
  const crawlerRunItemRepository = new PrismaCrawlerRunItemRepository(prisma)

  try {
    const lang = await languageRepository.findBySlug(LANGUAGE_SLUG)
    if (!lang) {
      throw new Error(`language slug "${LANGUAGE_SLUG}" not found in DB`)
    }

    /** orphan running の救済（前回 run が succeed/fail 到達前に死んだ場合） */
    const staleCount = await crawlerRunRepository.markStaleAsFailed(RUN_TYPE)
    if (staleCount > 0) {
      logger.warn("crawler_run: stale running marked as failed", { runType: RUN_TYPE, staleCount })
    }

    // DB: CrawlerRunにcronジョブの起動を記録
    const { id: runId } = await crawlerRunRepository.start({
      runType: RUN_TYPE,
      startedAt: new Date(),
    })

    try {
      let reposProcessed = 0
      let problemsAdded = 0
      for (let i = 0; i < env.CRAWLER_REPOS_PER_RUN; i++) {
        if (shutdownHandle.isShuttingDown()) break
        const target = await pickNextRepo(
          lang,
          { crawledRepoRepository },
          { github }
        )
        if (!target) {
          logger.info("no more repos to process", { slug: LANGUAGE_SLUG })
          break
        }
        // DB: CrawlerRunItemに問題抽出対象のGit Repositoryを記録
        const item = await crawlerRunItemRepository.start({
          crawlerRunId: runId,
          languageId: lang.id,
          startedAt: new Date(),
          targetOwner: target.owner,
          targetRepo: target.name,
        })
        try {
          // Git Repositoryから関数を抽出して、DB:Problemに保存
          const result = await processRepo(
            { languageId: lang.id, name: target.name, owner: target.owner },
            { crawledRepoRepository, problemRepository },
            { github }
          )
          const added = result.adopted ? result.problemsAdded : 0
          // 成功を記録
          await crawlerRunItemRepository.succeed(item.id, new Date(), added)
          reposProcessed++
          problemsAdded += added
        } catch (err) {
          /** 部分失敗の継続：item に記録して次の repo へ */
          logger.error("processRepo failed",err instanceof Error ? err : new Error(String(err)),{ fullName: `${target.owner}/${target.name}` })
          // 失敗を記録して次の処理へ
          await crawlerRunItemRepository.fail(item.id, new Date(), err)
          reposProcessed++
        }
      }
      // 最後までループしたらジョブの記録を成功として保存
      await crawlerRunRepository.succeed(runId, new Date(), reposProcessed, problemsAdded)
    } catch (err) {
      /**
       * fail() 自体が DB 障害で throw した場合は元エラーが消えるが、ほぼ同じ DB 障害が
       * 原因なので調査には支障なし。orphan running は次回 run の markStaleAsFailed が回収する。
       */
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
    logger.error(
      "crawler-run-typescript failed",
      err instanceof Error ? err : new Error(String(err))
    )
    process.exit(1)
  })
