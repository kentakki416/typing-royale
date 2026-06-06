import * as Sentry from "@sentry/node"

import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { GithubClient } from "../client/github"
import { env } from "../env"
import {
  PrismaCrawledRepoRepository,
  PrismaCrawlerRunRepository,
  PrismaProblemRepository,
} from "../repository/prisma"
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import { licenseRecheck } from "../service/license/verifier"

/**
 * crawler:license-recheck - 月次ライセンス再検証の起動エントリ。
 *
 * 既存の crawled_repos のうち disabled=false の全 repo について GitHub Repos API
 * で最新ライセンスを取り直し、寛容ライセンスから外れたものを disabled に倒す。
 * 同 repo に紐づく problems も一括無効化する。
 *
 * run 全体は crawler_runs に start → succeed/fail を直接記録する。個別 repo の履歴
 * （crawler_run_items）は使わない（失敗 / 成功は logger.warn と Sentry で十分）。
 */

Sentry.init({ dsn: env.SENTRY_DSN, enabled: env.NODE_ENV === "production" })

const main = async (): Promise<void> => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })
  const shutdownHandle = setupGracefulShutdown(prisma)

  const github = new GithubClient({
    pat: env.GITHUB_PAT,
    minStars: env.CRAWLER_MIN_STARS,
    pushedAfter: env.CRAWLER_PUSHED_AFTER,
  })
  const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
  const problemRepository = new PrismaProblemRepository(prisma)
  const crawlerRunRepository = new PrismaCrawlerRunRepository(prisma)

  try {
    /** orphan running の救済（前回 run が succeed/fail 到達前に死んだ場合） */
    const staleCount = await crawlerRunRepository.markStaleAsFailed("license_recheck")
    if (staleCount > 0) {
      logger.warn("crawler_run: stale running marked as failed", { staleCount })
    }

    const { id: runId } = await crawlerRunRepository.start({
      runType: "license_recheck",
      startedAt: new Date(),
    })

    try {
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
      await crawlerRunRepository.succeed(
        runId,
        new Date(),
        result.reposProcessed,
        result.disabledProblems
      )
    } catch (err) {
      /**
       * fail() 自体が失敗しても元エラーは必ず rethrow する。
       * fail() の失敗は orphan running として残るが、次回 run の markStaleAsFailed が回収する。
       */
      try {
        await crawlerRunRepository.fail(runId, new Date(), err)
      } catch (failErr) {
        logger.error(
          "crawlerRunRepository.fail failed",
          failErr instanceof Error ? failErr : new Error(String(failErr))
        )
      }
      throw err
    }
  } catch (err) {
    Sentry.captureException(err)
    logger.error(
      "crawler-license-recheck failed",
      err instanceof Error ? err : new Error(String(err))
    )
    throw err
  } finally {
    if (!shutdownHandle.isShuttingDown()) await prisma.$disconnect()
  }
}

void main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
