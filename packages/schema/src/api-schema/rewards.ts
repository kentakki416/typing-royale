import { z } from "zod"

// ========================================================
// 共通定数 / 共通スキーマ
// ========================================================

/**
 * reward の対象言語 slug。reward は言語マスタ (languages テーブル) 駆動で汎用化されて
 * おり、特定の言語に enum で限定しない。新しい言語がマスタに追加されればコード変更
 * なしで reward 対象になる。値の正当性は /finish が言語マスタを参照して担保する。
 */
const rewardLanguageSchema = z.string().min(1)

/**
 * type ごとに payload の shape が異なる
 * - grade_up: { grade_slug }
 * - card: { milestone_label } (既存、MVP では未対応で 400)
 */
const createCardPayloadSchema = z.union([
  z.object({ grade_slug: z.string().min(1) }),
  z.object({ milestone_label: z.string().min(1) }),
])

// ========================================================
// POST /api/rewards/cards - 達成カード PNG 生成 (冪等 upsert) ※既存
// ========================================================

export const createRewardCardRequestSchema = z.object({
  payload: createCardPayloadSchema,
  type: z.enum(["card", "grade_up"]),
})

export type CreateRewardCardRequest = z.infer<typeof createRewardCardRequestSchema>

// ========================================================
// レスポンス共通エントリ (asset_svg_url を追加)
// ========================================================

const rewardEntrySchema = z.object({
  asset_svg_url: z.string().nullable(),
  asset_url: z.string().nullable(),
  /**
   * 画像生成ステータス。rewards-worker (step3) で apps/worker が遷移を管理する。
   * step4 でホーム見逃し popup が "completed" のみ表示するために使う
   */
  generation_status: z.enum(["completed", "failed", "pending", "processing"]),
  granted_at: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
  reward_id: z.number().int().positive(),
  type: z.string(),
})

export const createRewardCardResponseSchema = rewardEntrySchema

// ========================================================
// POST /api/rewards/generate - special-badges 用の冪等生成 API
// ========================================================

const yearMonthRegex = /^\d{4}-\d{2}$/

export const generateRewardRequestSchema = z.discriminatedUnion("type", [
  z.object({
    language: rewardLanguageSchema,
    rank: z.number().int().min(1).max(10),
    type: z.literal("hall_of_fame_in"),
  }),
  z.object({
    language: rewardLanguageSchema,
    rank: z.number().int().min(1).max(10),
    type: z.literal("monthly_top_ten"),
    year_month: z.string().regex(yearMonthRegex),
  }),
])

export type GenerateRewardRequest = z.infer<typeof generateRewardRequestSchema>

export const generateRewardResponseSchema = rewardEntrySchema

export type GenerateRewardResponse = z.infer<typeof generateRewardResponseSchema>

// ========================================================
// GET /api/rewards/me - 獲得済み特典一覧 (ids クエリで絞り込み可)
// ========================================================

/**
 * クエリ `?ids=1,2,3` で reward id を絞り込み（ホームポップアップの polling 用）
 */
export const getMyRewardsQueryStringSchema = z.object({
  ids: z.string().optional(),
})

export type GetMyRewardsQueryString = z.infer<typeof getMyRewardsQueryStringSchema>

export const getMyRewardsResponseSchema = z.object({
  rewards: z.array(rewardEntrySchema),
})

export type CreateRewardCardResponse = z.infer<typeof createRewardCardResponseSchema>
export type GetMyRewardsResponse = z.infer<typeof getMyRewardsResponseSchema>

// ========================================================
// /finish の pending_rewards (special-badges 用)
// ========================================================

/**
 * /finish のレスポンスに含める "これから生成されるべき" reward のリスト。
 * クライアントはこれを sessionStorage に保存しホーム遷移後の polling に使う
 */
export const pendingRewardSchema = z.discriminatedUnion("type", [
  z.object({
    language: rewardLanguageSchema,
    rank: z.number().int().min(1).max(10),
    reward_id: z.number().int().positive(),
    type: z.literal("hall_of_fame_in"),
  }),
  z.object({
    language: rewardLanguageSchema,
    rank: z.number().int().min(1).max(10),
    reward_id: z.number().int().positive(),
    type: z.literal("monthly_top_ten"),
    year_month: z.string().regex(yearMonthRegex),
  }),
  /** rewards-worker step3: grade_up も worker 生成に統一したので pending_rewards に含める */
  z.object({
    grade_slug: z.string().min(1),
    reward_id: z.number().int().positive(),
    type: z.literal("grade_up"),
  }),
])

export type PendingReward = z.infer<typeof pendingRewardSchema>
