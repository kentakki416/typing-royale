import * as Sentry from "@sentry/node"

import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { GithubClient } from "../client/github"
import { env } from "../env"
import { PrismaCrawledRepoRepository } from "../service/crawler/crawled-repo-repository"
import { PrismaCrawlerRunItemRepository } from "../service/crawler/crawler-run-item-repository"
import { PrismaCrawlerRunRepository } from "../service/crawler/crawler-run-repository"
import { pickNextRepo } from "../service/crawler/pick-next-repo"
import { processRepo } from "../service/crawler/process-repo"
import { runWithCrawlerRunTracking } from "../service/crawler/run-tracker"
import { PrismaLanguageRepository } from "../service/language/repository"
import { PrismaProblemRepository } from "../service/problem-pool/repository"

/**
 * crawler:run - 週次クローラの起動エントリ。
 *
 * env を組み立てて Prisma / GithubClient / 各 Repository を生成し、
 * service/crawler の processRepo + pickNextRepo を回す。run 全体は
 * runWithCrawlerRunTracking で crawler_runs にトラッキング、個別 repo は
 * crawler_run_items で履歴を残す。
 *
 * SIGTERM (ECS Scheduled Task) / SIGINT (Ctrl-C) で graceful shutdown：
 *   - Prisma の disconnect を実行
 *   - 進行中の run は catch されないので crawler_runs.status=running のまま残る
 *     → 次回起動時の markStaleAsFailed で 30 分後に自動 failed 化される
 */

Sentry.init({ dsn: env.SENTRY_DSN, enabled: env.NODE_ENV === "production" })

const main = async (): Promise<void> => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })

  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.warn("shutdown initiated", { signal })
    try {
      await prisma.$disconnect()
    } catch (err) {
      logger.error(
        "prisma disconnect failed during shutdown",
        err instanceof Error ? err : new Error(String(err))
      )
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
        for (const rawSlug of env.CRAWLER_LANGUAGES.split(",")) {
          const slug = rawSlug.trim()
          const lang = await languageRepository.findBySlug(slug)
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
                { crawledRepoRepository, github, problemRepository }
              )
              const added = result.adopted ? result.problemsAdded : 0
              await crawlerRunItemRepository.succeed(item.id, new Date(), added)
              reposProcessed++
              problemsAdded += added
            } catch (err) {
              /** 部分失敗の継続：item に記録して次の repo へ */
              Sentry.captureException(err)
              logger.error(
                "processRepo failed",
                err instanceof Error ? err : new Error(String(err)),
                { fullName: `${target.owner}/${target.name}` }
              )
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
    logger.error(
      "crawler-run failed",
      err instanceof Error ? err : new Error(String(err))
    )
    throw err
  } finally {
    if (!shuttingDown) await prisma.$disconnect()
  }
}

void main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
