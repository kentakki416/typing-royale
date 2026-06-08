import { z } from "zod"

// ========================================================
// 共通定数
// ========================================================

const LANGUAGE_SLUG = z.string().min(1).max(32)
const COMMENT = z.string().min(1).max(300)

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
    display_name: z.string(),
  }),
  accuracy: z.number().min(0).max(1),
  best_play_session_id: z.number().int().positive(),
  /**
   * step5 のマイページコメント編集タブで PATCH 先 entry を特定するため
   */
  entry_id: z.number().int().positive().nullable(),
  comment: z.string().nullable(),
  comment_submitted_at: z.string().datetime().nullable(),
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

// ========================================================
// POST /api/hall-of-fame/comments - 入賞者本人のコメント送信 (即時公開)
// ========================================================

export const submitHallOfFameCommentRequestSchema = z.object({
  comment: COMMENT,
  language: LANGUAGE_SLUG,
})

export type SubmitHallOfFameCommentRequest = z.infer<typeof submitHallOfFameCommentRequestSchema>

// ========================================================
// PATCH /api/hall-of-fame/comments/:entryId - 自分のコメント編集
// ========================================================

export const updateHallOfFameCommentPathParamSchema = z.object({
  entryId: z.coerce.number().int().positive(),
})

export const updateHallOfFameCommentRequestSchema = z.object({
  comment: COMMENT,
})

export type UpdateHallOfFameCommentPathParam = z.infer<typeof updateHallOfFameCommentPathParamSchema>
export type UpdateHallOfFameCommentRequest = z.infer<typeof updateHallOfFameCommentRequestSchema>

// ========================================================
// POST / PATCH 共通のレスポンス
// ========================================================

export const hallOfFameCommentResponseSchema = z.object({
  comment: z.string(),
  comment_submitted_at: z.string().datetime(),
  entry_id: z.number().int().positive(),
  language: z.string(),
})

export type HallOfFameCommentResponse = z.infer<typeof hallOfFameCommentResponseSchema>
