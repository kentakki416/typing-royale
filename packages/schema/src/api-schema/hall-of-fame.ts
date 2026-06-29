import { z } from "zod"

// ========================================================
// 共通定数
// ========================================================

const LANGUAGE_SLUG = z.string().min(1).max(32)

// ========================================================
// GET /api/hall-of-fame - 言語別 Hall of Fame (公開)
// ========================================================

/**
 * GET /api/hall-of-fame の query string
 */
export const getHallOfFameQueryStringSchema = z.object({
  language: LANGUAGE_SLUG,
})

const hallOfFameEntrySchema = z.object({
  rank: z.number().int().min(1),
  user: z.object({
    id: z.number().int().positive(),
    avatar_url: z.string().url().nullable(),
    current_grade: z.string(),
    github_username: z.string().nullable(),
    favorite_repo_url: z.string().nullable(),
  }),
  accuracy: z.number().min(0).max(1),
  best_play_session_id: z.number().int().positive(),
  /** このベストスコアを出したときの出題元 OSS リポジトリ */
  crawled_repo: z.object({
    full_name: z.string(),
    name: z.string(),
    owner: z.string(),
  }),
  played_at: z.string().datetime(),
  score: z.number().int().nonnegative(),
  typed_chars: z.number().int().nonnegative(),
})

export const getHallOfFameResponseSchema = z.object({
  entries: z.array(hallOfFameEntrySchema).max(10),
  language: z.string(),
})

export type GetHallOfFameQueryString = z.infer<typeof getHallOfFameQueryStringSchema>
export type GetHallOfFameResponse = z.infer<typeof getHallOfFameResponseSchema>
