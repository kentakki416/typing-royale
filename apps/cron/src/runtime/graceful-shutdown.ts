import type { PrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

export type ShutdownHandle = {
  isShuttingDown: () => boolean
}

/**
 * SIGTERM (ECS Scheduled Task) / SIGINT (Ctrl-C) を受けたときに
 * Prisma を disconnect してから process.exit する graceful shutdown を登録する。
 *
 * 返り値の isShuttingDown は task 側のループや finally から状態を読むためのハンドル。
 * 進行中の run は catch されないので、未完了の状態は呼び出し側 (crawler_runs.status=running 等)
 * のリカバリロジックに任せる。
 */
export const setupGracefulShutdown = (prisma: PrismaClient): ShutdownHandle => {
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
  return { isShuttingDown: () => shuttingDown }
}
