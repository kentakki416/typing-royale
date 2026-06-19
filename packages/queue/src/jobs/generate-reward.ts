/**
 * generate-reward Queue: reward の SVG / PNG を非同期生成する。
 *
 * - Producer (apps/api の /finish): pending 行 INSERT 後、rewardId を data に
 *   enqueue する。jobId は rewardId 単位で決定的に生成して重複排除する
 * - Consumer (apps/worker): rewards から該当行を読み出し、SVG/PNG を生成して
 *   asset_url / asset_svg_url / generation_status を update する
 *
 * 設計詳細: docs/spec/rewards-worker/step1-packages-queue-and-generate-image.md
 */

export const GENERATE_REWARD_QUEUE_NAME = "generate-reward"

export type GenerateRewardJobData = {
    rewardId: number
}

/**
 * 同じ rewardId に対する重複 enqueue を防ぐための決定的 jobId。
 * BullMQ では同じ jobId のジョブを add しようとしても黙って捨てられる
 * (他の Queue 実装では best-effort)
 */
export const buildGenerateRewardJobId = (rewardId: number): string =>
  `generate-reward-${rewardId}`
