import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"
import { createRedisClient } from "@repo/redis"

import { env } from "./env"
import { LocalCardStorage, S3CardStorage } from "./lib/card-storage"
import { PrismaRewardRepository, PrismaUserRepository } from "./repository/prisma"
import { setupGracefulShutdown } from "./runtime/graceful-shutdown"
import { startGenerateRewardWorker } from "./workers/generate-reward-worker"

/**
 * apps/worker のエントリポイント。
 *
 * reward の SVG / PNG 生成を BullMQ Worker として常駐処理する。新しい queue を
 * 増やすときは:
 *   1. `packages/queue` に Job 型と queue 名を追加
 *   2. `src/jobs/<name>.ts` に純粋なハンドラを書く
 *   3. `src/workers/<name>-worker.ts` で組み立てる
 *   4. ここで `startXxxWorker(...)` を呼んで `consumers` に push
 */
const main = (): void => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })
  /**
   * BullMQ Worker は `maxRetriesPerRequest: null` の Redis 接続が必須 (BullMQ 5.x 要件)
   */
  const redis = createRedisClient({
    options: { maxRetriesPerRequest: null },
    url: env.REDIS_URL,
  })

  /**
   * 本番 (worker と api が別コンテナ = filesystem 非共有) は S3 に保存して公開 URL を返す。
   * ローカル開発は従来どおり filesystem に書き、api が同じ REWARDS_CACHE_DIR を static 配信する
   */
  const cardStorage = env.REWARDS_STORAGE === "s3"
    ? new S3CardStorage(env.REWARDS_S3_BUCKET!, env.REWARDS_PUBLIC_URL_BASE!, env.AWS_REGION)
    : new LocalCardStorage(env.REWARDS_CACHE_DIR, env.REWARDS_PUBLIC_URL_PREFIX)
  const rewardRepository = new PrismaRewardRepository(prisma)
  const userRepository = new PrismaUserRepository(prisma)

  const consumers = [
    startGenerateRewardWorker({
      cardStorage,
      concurrency: env.WORKER_CONCURRENCY,
      redis,
      rewardRepository,
      userRepository,
    }),
  ]

  setupGracefulShutdown({ consumers, prisma, redis })

  logger.info("worker started", {
    concurrency: env.WORKER_CONCURRENCY,
    queues: ["generate-reward"],
  })
}

main()
