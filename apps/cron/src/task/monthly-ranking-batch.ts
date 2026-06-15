import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { env } from "../env"
import { PrismaMonthlyRankingSnapshotRepository } from "../repository/prisma"
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import { MonthlyRankingAggregator } from "../service/monthly-ranking/aggregator"

/**
 * batch:monthly-ranking - 毎時 0 分の月間ランキング集計エントリ。
 *
 * 当月 (JST 暦月) の play_sessions を集計し、各 (年月, 言語) ごとに上位 10 位までを
 * monthly_ranking_snapshots に UPSERT する。実処理は MonthlyRankingAggregator に任せ、
 * このファイルは env / DB client / repository / service の組み立てに専念する。
 *
 * 詳細仕様は docs/spec/monthly-ranking/README.md を参照
 */
const main = async (): Promise<void> => {
  /** SIGTERM / SIGINT を受け取れるようにする（本処理は短時間なので abort 確認は省略） */
  setupGracefulShutdown()

  if (env.DATABASE_URL === undefined) {
    throw new Error("DATABASE_URL is required for batch:monthly-ranking")
  }
  const prisma = createPrismaClient({ url: env.DATABASE_URL })

  try {
    const repo = new PrismaMonthlyRankingSnapshotRepository(prisma)
    const aggregator = new MonthlyRankingAggregator(repo)
    const result = await aggregator.run()
    logger.info("batch:monthly-ranking finished", result)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  logger.error(
    "batch:monthly-ranking failed",
    err instanceof Error ? err : new Error(String(err))
  )
  process.exit(1)
})
