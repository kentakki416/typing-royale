import { z } from "zod"

// ========================================================
// GET /api/rankings - 言語別オールタイムランキング TOP N
// ========================================================

/**
 * GET /api/rankings の query string
 */
export const getRankingsQueryStringSchema = z.object({
  language: z.string().min(1).max(32),
  limit: z.coerce.number().int().min(1).max(10).default(10),
})

/**
 * ランキング 1 エントリの user 表示情報
 */
const rankingEntryUserSchema = z.object({
  id: z.number().int().positive(),
  avatar_url: z.string().url().nullable(),
  current_grade: z.string(),
  display_name: z.string(),
})

/**
 * ランキング 1 エントリ
 */
const rankingEntrySchema = z.object({
  rank: z.number().int().min(1),
  user: rankingEntryUserSchema,
  accuracy: z.number().min(0).max(1),
  best_play_session_id: z.number().int().positive(),
  played_at: z.string().datetime(),
  score: z.number().int().nonnegative(),
  typed_chars: z.number().int().nonnegative(),
})

/**
 * GET /api/rankings のレスポンス
 */
export const getRankingsResponseSchema = z.object({
  entries: z.array(rankingEntrySchema).max(10),
  language: z.string(),
  total_ranked_players: z.number().int().nonnegative(),
})

export type GetRankingsQueryString = z.infer<typeof getRankingsQueryStringSchema>
export type GetRankingsResponse = z.infer<typeof getRankingsResponseSchema>

// ========================================================
// GET /api/rankings/me - 認証ユーザーの言語別順位 + グレード
// ========================================================

/**
 * GET /api/rankings/me の query string
 */
export const getMyRankingQueryStringSchema = z.object({
  language: z.string().min(1).max(32),
})

/**
 * グレード情報
 */
const gradeSchema = z.object({
  level: z.number().int().min(1).max(8),
  name: z.string(),
  slug: z.string(),
})

const nextGradeSchema = gradeSchema.extend({
  score_needed: z.number().int().nonnegative(),
})

/**
 * GET /api/rankings/me のレスポンス
 */
export const getMyRankingResponseSchema = z.object({
  best_accuracy: z.number().min(0).max(1).nullable(),
  best_play_session_id: z.number().int().positive().nullable(),
  best_played_at: z.string().datetime().nullable(),
  best_score: z.number().int().nonnegative().nullable(),
  grade: gradeSchema,
  language: z.string(),
  next_grade: nextGradeSchema.nullable(),
  rank: z.number().int().min(1).nullable(),
  total_ranked_players: z.number().int().nonnegative(),
})

export type GetMyRankingQueryString = z.infer<typeof getMyRankingQueryStringSchema>
export type GetMyRankingResponse = z.infer<typeof getMyRankingResponseSchema>

// ========================================================
// GET /api/rankings/monthly - 当月の言語別 TOP N
// ========================================================

/**
 * GET /api/rankings/monthly の query string
 *
 * - language: typescript / javascript の 2 値
 * - limit:    1〜10、デフォルト 5 (ホーム画面は 5 件表示、最大でも 10 件まで)
 */
export const getMonthlyRankingsQueryStringSchema = z.object({
  language: z.enum(["typescript", "javascript"]),
  limit: z.coerce.number().int().min(1).max(10).default(5),
})

/**
 * 月間ランキング 1 エントリの user 表示情報
 */
const monthlyRankingEntryUserSchema = z.object({
  id: z.number().int().positive(),
  avatar_url: z.string().url().nullable(),
  current_grade: z.string(),
  display_name: z.string(),
})

/**
 * 月間ランキング 1 エントリ
 */
const monthlyRankingEntrySchema = z.object({
  accuracy: z.number().min(0).max(1),
  played_at: z.string().datetime(),
  rank: z.number().int().min(1),
  score: z.number().int().nonnegative(),
  user: monthlyRankingEntryUserSchema,
})

/**
 * GET /api/rankings/monthly のレスポンス
 *
 * year_month は "YYYY-MM" 形式の JST 暦月
 */
export const getMonthlyRankingsResponseSchema = z.object({
  entries: z.array(monthlyRankingEntrySchema).max(10),
  year_month: z.string().regex(/^\d{4}-\d{2}$/),
})

export type GetMonthlyRankingsQueryString = z.infer<typeof getMonthlyRankingsQueryStringSchema>
export type GetMonthlyRankingsResponse = z.infer<typeof getMonthlyRankingsResponseSchema>
