import { GENERATE_REWARD_QUEUE_NAME, type JobConsumer, startBullMQWorker } from "@repo/queue"
import type { Redis } from "@repo/redis"

import { generateReward } from "../jobs/generate-reward"
import type { CardStorage } from "../lib/card-storage"
import type { RewardRepository, UserRepository } from "../repository/prisma"

/**
 * `generate-reward` Worker の組み立て。
 *
 * Queue 実装 (BullMQ) と job ハンドラ (generateReward) をここで結線する。
 * 別の Queue 実装 (SQS / Cloud Tasks 等) に切り替えるときは `startBullMQWorker` を
 * 別関数に差し替えるだけで、`generateReward` 自体は変更不要。
 *
 * `onFinalFailure`: リトライ上限 (attempts=3) に到達した最終失敗時に reward を
 * generation_status="failed" に落とし、UI のポーリング対象から外す。
 */
export type StartGenerateRewardWorkerArgs = {
    cardStorage: CardStorage
    concurrency: number
    redis: Redis
    rewardRepository: RewardRepository
    userRepository: UserRepository
}

export const startGenerateRewardWorker = (
  args: StartGenerateRewardWorkerArgs,
): JobConsumer =>
  startBullMQWorker(args.redis, {
    concurrency: args.concurrency,
    onFinalFailure: async (info) => {
      await args.rewardRepository.updateGenerationStatus(info.data.rewardId, "failed")
    },
    processor: generateReward({
      cardStorage: args.cardStorage,
      rewardRepository: args.rewardRepository,
      userRepository: args.userRepository,
    }),
    queueName: GENERATE_REWARD_QUEUE_NAME,
  })
