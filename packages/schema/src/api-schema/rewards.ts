import { z } from "zod"

// ========================================================
// 共通定数
// ========================================================

const REWARD_TYPES = ["grade_up", "card"] as const

/**
 * type ごとに payload の shape が異なる
 * - grade_up: { grade_slug }
 * - card: { milestone_label }
 */
const createCardPayloadSchema = z.union([
  z.object({ grade_slug: z.string().min(1) }),
  z.object({ milestone_label: z.string().min(1) }),
])

// ========================================================
// POST /api/rewards/cards - 達成カード PNG 生成 (冪等 upsert)
// ========================================================

export const createRewardCardRequestSchema = z.object({
  payload: createCardPayloadSchema,
  type: z.enum(REWARD_TYPES),
})

export type CreateRewardCardRequest = z.infer<typeof createRewardCardRequestSchema>

// ========================================================
// レスポンス共通
// ========================================================

const rewardEntrySchema = z.object({
  asset_url: z.string().nullable(),
  granted_at: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
  reward_id: z.number().int().positive(),
  type: z.string(),
})

export const createRewardCardResponseSchema = rewardEntrySchema

// ========================================================
// GET /api/rewards/me - 獲得済み特典一覧
// ========================================================

export const getMyRewardsResponseSchema = z.object({
  rewards: z.array(rewardEntrySchema),
})

export type CreateRewardCardResponse = z.infer<typeof createRewardCardResponseSchema>
export type GetMyRewardsResponse = z.infer<typeof getMyRewardsResponseSchema>
