import { createPrismaClient, type PrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { env } from "../env"
import { PrismaCrawlerRunRepository } from "../repository/prisma"

import { setupGracefulShutdown, type ShutdownHandle } from "./graceful-shutdown"

export type CrawlerJobResult = {
  /** crawler_runs.problemsAdded として記録される値（追加問題数、または無効化問題数など run の指標） */
  problemsAdded: number
  /** crawler_runs.reposProcessed として記録される値 */
  reposProcessed: number
}

export type CrawlerJobContext = {
  prisma: PrismaClient
  /** `crawler_runs.id`。子テーブル (`crawler_run_items` 等) を紐付ける場合に使う */
  runId: number
  /** shutdown signal。長い処理の前後で `signal.aborted` を確認して協調的に中断する */
  signal: AbortSignal
}

export type CrawlerJobConfig = {
  /**
   * crawler_runs に記録する run の本体処理。
   * 失敗した場合は throw すれば runtime 側が fail を記録してから rethrow する。
   */
  exec: (ctx: CrawlerJobContext) => Promise<CrawlerJobResult>
  /** 例: "crawler_typescript" / "license_recheck"。crawler_runs.runType と stale 復旧の対象キーに使う */
  runType: string
  /** 例: "crawler-run-typescript"。logger に出すラベル */
  taskName: string
}

/**
 * cron task のテンプレ処理。各 task ファイルは「DI セットアップ + exec の中身」だけ
 * を担い、Prisma の生成 / graceful shutdown / crawler_runs の start・succeed・fail /
 * markStaleAsFailed / disconnect / process.exit はここに集約する。
 *
 * フロー:
 *   1. PrismaClient を生成して graceful shutdown を仕掛ける
 *   2. crawler_runs に対して stale running の救済 + start を記録
 *   3. exec({ prisma, signal }) を呼んで結果を受け取り、succeed を記録
 *   4. exec が throw したら fail を記録して rethrow
 *   5. 必ず prisma.$disconnect()（**ここが唯一の disconnect ポイント**）
 *   6. then で exit(0)、catch で exit(1)。shutdown 起因の中断時は signal に応じた exit code
 */
export const runAsCrawlerJob = (config: CrawlerJobConfig): void => {
  const { exec, runType, taskName } = config

  const main = async (): Promise<ShutdownHandle> => {
    const prisma = createPrismaClient({ url: env.DATABASE_URL })
    const shutdownHandle = setupGracefulShutdown()
    const crawlerRunRepository = new PrismaCrawlerRunRepository(prisma)

    try {
      /** orphan running の救済（前回 run が succeed/fail 到達前に死んだ場合） */
      const staleCount = await crawlerRunRepository.markStaleAsFailed(runType)
      if (staleCount > 0) {
        logger.warn("crawler_run: stale running marked as failed", { runType, staleCount })
      }

      const { id: runId } = await crawlerRunRepository.start({
        runType,
        startedAt: new Date(),
      })

      try {
        const result = await exec({ prisma, runId, signal: shutdownHandle.signal })
        await crawlerRunRepository.succeed(
          runId,
          new Date(),
          result.reposProcessed,
          result.problemsAdded
        )
      } catch (err) {
        /**
         * fail() 自体が DB 障害で throw した場合は元エラーが消えるが、ほぼ同じ DB 障害が
         * 原因なので調査には支障なし。orphan running は次回 run の markStaleAsFailed が回収する。
         */
        await crawlerRunRepository.fail(runId, new Date(), err)
        throw err
      }
    } finally {
      try {
        await prisma.$disconnect()
      } catch (err) {
        logger.error(
          "prisma disconnect failed",
          err instanceof Error ? err : new Error(String(err))
        )
      }
    }

    return shutdownHandle
  }

  void main()
    .then((shutdownHandle) => {
      const sig = shutdownHandle.signalReceived()
      /**
       * SIGINT は慣例に従い 130、SIGTERM は ECS の正常停止扱いで 0、
       * 通常完了も 0。
       */
      if (sig === "SIGINT") {
        process.exit(130)
      }
      process.exit(0)
    })
    .catch((err: unknown) => {
      logger.error(
        `${taskName} failed`,
        err instanceof Error ? err : new Error(String(err))
      )
      process.exit(1)
    })
}
