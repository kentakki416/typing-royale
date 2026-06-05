import * as Sentry from "@sentry/node"

import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { GithubClient } from "../client/github"
import { env } from "../env"
import { PrismaCrawledRepoRepository } from "../service/crawler/crawled-repo-repository"
import { PrismaCrawlerRunRepository } from "../service/crawler/crawler-run-repository"
import { runWithCrawlerRunTracking } from "../service/crawler/run-tracker"
import { licenseRecheck } from "../service/license/verifier"
import { PrismaProblemRepository } from "../service/problem-pool/repository"

/**
 * crawler:license-recheck - 月次ライセンス再検証の起動エントリ。
 *
 * 既存の crawled_repos のうち disabled=false の全 repo について GitHub Repos API
 * で最新ライセンスを取り直し、寛容ライセンスから外れたものを disabled に倒す。
 * 同 repo に紐づく problems も一括無効化する。
 *
 * crawler:run と同じく runWithCrawlerRunTracking で crawler_runs に記録するが、
 * 個別 repo の履歴（crawler_run_items）は使わない（再検証は repo 1 回ずつなので、
 * 失敗 / 成功は logger.warn と Sentry で十分）。
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
  const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
  const problemRepository = new PrismaProblemRepository(prisma)
  const crawlerRunRepository = new PrismaCrawlerRunRepository(prisma)

  try {
    await runWithCrawlerRunTracking(
      "license_recheck",
      { crawlerRunRepository },
      async () => {
        const result = await licenseRecheck({
          crawledRepoRepository,
          github,
          problemRepository,
        })
        /**
         * crawler_runs の集計セマンティクスに合わせ、
         *   - reposProcessed: 再検証した repo 総数
         *   - problemsAdded: 無効化した problems 総数（追加ではなく削除側だが、
         *     run のインパクト指標として記録する）
         */
        return {
          problemsAdded: result.disabledProblems,
          reposProcessed: result.reposProcessed,
        }
      },
      { forceRerun: env.CRAWLER_FORCE_RERUN }
    )
  } catch (err) {
    Sentry.captureException(err)
    logger.error(
      "crawler-license-recheck failed",
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
