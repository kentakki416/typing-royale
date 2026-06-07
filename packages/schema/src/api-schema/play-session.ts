import { z } from "zod"

// ========================================================
// プレイセッション共通スキーマ
// ========================================================

/**
 * 問題プール由来の repo メタ情報
 * リザルト画面の「ちなみに今回のリポジトリは XXX で…」コメントに利用
 */
const repoInfoSchema = z.object({
  description: z.string().nullable(),
  homepage: z.string().nullable(),
  name: z.string(),
  owner: z.string(),
  stars: z.number().int().nonnegative(),
  topics: z.array(z.string()),
})

/**
 * 出題する問題 1 件
 * 関数本体はコメント除去済み（problem-pool 仕様）
 */
const playSessionProblemSchema = z.object({
  id: z.number().int().positive(),
  char_count: z.number().int().positive(),
  code_block: z.string(),
  function_name: z.string(),
  line_count: z.number().int().positive(),
  order_index: z.number().int().nonnegative(),
  source_url: z.string().url(),
})

/**
 * キーストロークログの 1 エントリ
 * 通常 ch は 1 文字、Enter / Backspace 等の特殊キー名は最大 20 文字
 */
const keystrokeEntrySchema = z.object({
  ch: z.string().min(1).max(20),
  ok: z.boolean(),
  p: z.number().int().nonnegative().max(19),
  t: z.number().nonnegative(),
})

/**
 * mistype_stats のレスポンス形式（key=正解期待文字、value=誤打鍵回数）
 */
const mistypeStatsSchema = z.record(z.string(), z.number().int().nonnegative())

// ========================================================
// POST /api/play-sessions/solo - 通常モードのセッション開始
// ========================================================

/**
 * 通常モードのセッション開始リクエスト
 */
export const startSoloPlaySessionRequestSchema = z.object({
  language_id: z.number().int().positive(),
})

/**
 * 通常モードのセッション開始レスポンス
 */
export const startSoloPlaySessionResponseSchema = z.object({
  problems: z.array(playSessionProblemSchema).length(20),
  repo_info: repoInfoSchema,
  session_id: z.string().uuid(),
})

export type StartSoloPlaySessionRequest = z.infer<typeof startSoloPlaySessionRequestSchema>
export type StartSoloPlaySessionResponse = z.infer<typeof startSoloPlaySessionResponseSchema>

// ========================================================
// POST /api/play-sessions/:id/finish - プレイ結果集計と DB 書き込み
// ========================================================

/**
 * /finish の path param（sessionId は UUID v4）
 */
export const finishPlaySessionPathParamSchema = z.object({
  id: z.string().uuid(),
})

/**
 * /finish のリクエスト
 * 物理限界を超える値は Service 側で 400 として弾く
 */
export const finishPlaySessionRequestSchema = z.object({
  accuracy: z.number().min(0).max(1),
  keystroke_log: z.array(keystrokeEntrySchema).max(2000),
  typed_chars: z.number().int().nonnegative().max(1500),
})

/**
 * /finish のレスポンス
 */
export const finishPlaySessionResponseSchema = z.object({
  accuracy: z.number(),
  mistype_stats: mistypeStatsSchema,
  persisted: z.boolean(),
  problems_completed: z.number().int().nonnegative(),
  problems_played: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  typed_chars: z.number().int().nonnegative(),
})

export type FinishPlaySessionPathParam = z.infer<typeof finishPlaySessionPathParamSchema>
export type FinishPlaySessionRequest = z.infer<typeof finishPlaySessionRequestSchema>
export type FinishPlaySessionResponse = z.infer<typeof finishPlaySessionResponseSchema>
