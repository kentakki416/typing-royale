import { z } from "zod"

// ========================================================
// GET /api/replays/:playSessionId - リプレイ取得
// ========================================================

/**
 * リプレイ画面に表示する問題 1 件
 */
const replayProblemSchema = z.object({
  id: z.number().int().positive(),
  char_count: z.number().int().positive(),
  code_block: z.string(),
  function_name: z.string(),
  line_count: z.number().int().positive(),
  order_index: z.number().int().nonnegative(),
  source_url: z.string().url(),
})

/**
 * キーストロークログ 1 エントリ（ghost-battle と同形式）
 */
const replayKeystrokeEntrySchema = z.object({
  elapsed_ms: z.number().nonnegative(),
  input_char: z.string().min(1).max(20),
  is_correct: z.boolean(),
  problem_index: z.number().int().nonnegative().max(19),
})

/**
 * 出典 repo の表示情報
 */
const replayRepoInfoSchema = z.object({
  description: z.string().nullable(),
  homepage: z.string().nullable(),
  license: z.string(),
  name: z.string(),
  owner: z.string(),
  stars: z.number().int().nonnegative(),
  topics: z.array(z.string()),
})

/**
 * リプレイのプレイヤー情報
 */
const replayPlayerSchema = z.object({
  avatar_url: z.string().url().nullable(),
  current_grade: z.string(),
  display_name: z.string(),
  user_id: z.number().int().positive(),
})

/**
 * リプレイの統計情報
 */
const replayStatsSchema = z.object({
  accuracy: z.number().min(0).max(1),
  played_at: z.string(),
  problems_completed: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  typed_chars: z.number().int().nonnegative(),
})

/**
 * GET /api/replays/:playSessionId のパスパラメータ
 */
export const getReplayPathParamSchema = z.object({
  playSessionId: z.coerce.number().int().positive(),
})

/**
 * GET /api/replays/:playSessionId のレスポンス
 */
export const getReplayResponseSchema = z.object({
  keystroke_logs: z.array(replayKeystrokeEntrySchema),
  language: z.string(),
  play_session_id: z.number().int().positive(),
  player: replayPlayerSchema,
  problems: z.array(replayProblemSchema).min(1).max(20),
  repo_info: replayRepoInfoSchema,
  stats: replayStatsSchema,
})

export type GetReplayPathParam = z.infer<typeof getReplayPathParamSchema>
export type GetReplayResponse = z.infer<typeof getReplayResponseSchema>
