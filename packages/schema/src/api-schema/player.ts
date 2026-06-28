import { z } from "zod"

// ========================================================
// GET /api/players/:userId - プレイヤー詳細データ
// ========================================================

/**
 * GET /api/players/:userId の path param
 */
export const getPlayerPathParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
})

/**
 * グレード 1 件（player レスポンスに同梱）
 */
const playerGradeSchema = z.object({
  level: z.number().int().min(1).max(8),
  name: z.string(),
  slug: z.string(),
})

/**
 * プレイヤー詳細ページのヘッダー情報
 */
const playerUserSchema = z.object({
  id: z.number().int().positive(),
  avatar_url: z.string().url().nullable(),
  favorite_repo_url: z.string().nullable(),
  github_username: z.string().nullable(),
  joined_at: z.string().datetime(),
})

/**
 * 全言語通算の累計値
 */
const playerLifetimeStatsSchema = z.object({
  best_score: z.number().int().nonnegative(),
  current_grade: playerGradeSchema,
  current_grade_reached_at: z.string().datetime().nullable(),
  streak_days: z.number().int().nonnegative(),
  total_sessions: z.number().int().nonnegative(),
  total_typed_chars: z.number().int().nonnegative(),
})

/**
 * 言語別ベスト 1 件（rank はリアルタイム計算）
 */
const playerLanguageBestSchema = z.object({
  language: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    slug: z.string(),
  }),
  accuracy: z.number().min(0).max(1),
  best_play_session_id: z.number().int().positive(),
  played_at: z.string().datetime(),
  rank: z.number().int().min(1),
  score: z.number().int().nonnegative(),
  typed_chars: z.number().int().nonnegative(),
})

/**
 * GET /api/players/:userId のレスポンス
 */
export const getPlayerResponseSchema = z.object({
  language_bests: z.array(playerLanguageBestSchema),
  lifetime_stats: playerLifetimeStatsSchema,
  user: playerUserSchema,
})

export type GetPlayerPathParam = z.infer<typeof getPlayerPathParamSchema>
export type GetPlayerResponse = z.infer<typeof getPlayerResponseSchema>
