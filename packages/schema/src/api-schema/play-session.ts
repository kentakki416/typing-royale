import { z } from "zod"

import { pendingRewardSchema } from "./rewards"

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
 * 通常 input_char は 1 文字、Enter / Backspace 等の特殊キー名は最大 20 文字
 */
const keystrokeEntrySchema = z.object({
  elapsed_ms: z.number().nonnegative(),
  input_char: z.string().min(1).max(20),
  is_correct: z.boolean(),
  problem_index: z.number().int().nonnegative().max(19),
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
  keystroke_logs: z.array(keystrokeEntrySchema).max(2000),
  typed_chars: z.number().int().nonnegative().max(1500),
})

/**
 * グレード 1 件（score-ranking step3 で /finish レスポンスに同梱）
 */
const finishGradeSchema = z.object({
  level: z.number().int().min(1).max(8),
  name: z.string(),
  slug: z.string(),
})

/**
 * /finish のレスポンス
 */
export const finishPlaySessionResponseSchema = z.object({
  /** 既存 */
  accuracy: z.number(),
  mistype_stats: mistypeStatsSchema,
  persisted: z.boolean(),
  problems_completed: z.number().int().nonnegative(),
  problems_played: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  typed_chars: z.number().int().nonnegative(),

  /** score-ranking step3 で追加 */
  best_score_updated: z.boolean(),
  grade_up: z.object({
    from: finishGradeSchema,
    to: finishGradeSchema,
  }).nullable(),
  /**
   * 月間 TOP 10 の boundary score（= 当月 cap 内の最低 score、自分の upsert 反映後の値）。
   * 当月 snapshot が 10 件未満なら null（= 誰でも入賞判定対象）。
   * フロント側で `result.score >= monthly_top_ten_boundary_score || === null` で月間入賞判定する。
   * monthly-ranking v2 / result-top-ten-popup spec を参照
   */
  monthly_top_ten_boundary_score: z.number().int().nonnegative().nullable(),
  new_rank: z.number().int().min(1).nullable(),
  /**
   * /finish 時点での当該言語のランクイン総人数（ZSCORE と同時に取れるので
   * レスポンスに含めて、リザルト画面の「Y 人中」表示の追加 fetch を不要にする）
   */
  total_ranked_players: z.number().int().nonnegative(),
  top_ten_boundary_score: z.number().int().nonnegative().nullable(),

  /**
   * special-badges 用：これから生成されるべき reward の一覧。
   * クライアントは sessionStorage に保存しホーム遷移後の polling に使う。
   * 詳細は docs/spec/special-badges/README.md を参照
   */
  pending_rewards: z.array(pendingRewardSchema),
})

export type FinishPlaySessionPathParam = z.infer<typeof finishPlaySessionPathParamSchema>
export type FinishPlaySessionRequest = z.infer<typeof finishPlaySessionRequestSchema>
export type FinishPlaySessionResponse = z.infer<typeof finishPlaySessionResponseSchema>

// ========================================================
// POST /api/play-sessions/challenge-gods - 神々モードのセッション開始
// ========================================================

/**
 * 神の表示情報
 */
const ghostUserDisplaySchema = z.object({
  avatar_url: z.string().url().nullable(),
  best_score: z.number().int().nonnegative(),
  github_username: z.string().nullable(),
  grade: z.string(),
})

/**
 * 神々モードのセッション開始リクエスト
 */
export const startChallengeGodsRequestSchema = z.object({
  language_id: z.number().int().positive(),
})

/**
 * 神々モードのセッション開始レスポンス
 * トップ 10 不在時は 409 Conflict
 */
export const startChallengeGodsResponseSchema = z.object({
  ghost_keystroke_logs: z.array(
    z.object({
      elapsed_ms: z.number().nonnegative(),
      input_char: z.string().min(1).max(20),
      is_correct: z.boolean(),
      problem_index: z.number().int().nonnegative().max(19),
    }),
  ),
  ghost_session_id: z.number().int().positive(),
  ghost_user_display: ghostUserDisplaySchema,
  problems: z.array(playSessionProblemSchema).length(20),
  repo_info: repoInfoSchema,
  session_id: z.string().uuid(),
})

export type StartChallengeGodsRequest = z.infer<typeof startChallengeGodsRequestSchema>
export type StartChallengeGodsResponse = z.infer<typeof startChallengeGodsResponseSchema>

// ========================================================
// POST /api/play-sessions/guest/solo - ゲスト用 通常モードのセッション開始 (ステートレス)
// ========================================================

/**
 * ゲスト用通常モードのセッション開始リクエスト
 * 認証不要・Redis 不使用。問題抽選結果をそのまま返すだけ
 */
export const startGuestSoloPlaySessionRequestSchema = z.object({
  language_id: z.number().int().positive(),
})

/**
 * ゲスト用通常モードのセッション開始レスポンス
 * session_id は持たない（サーバー側に state を持たないため）
 */
export const startGuestSoloPlaySessionResponseSchema = z.object({
  problems: z.array(playSessionProblemSchema).length(20),
  repo_info: repoInfoSchema,
})

export type StartGuestSoloPlaySessionRequest = z.infer<typeof startGuestSoloPlaySessionRequestSchema>
export type StartGuestSoloPlaySessionResponse = z.infer<typeof startGuestSoloPlaySessionResponseSchema>

// ========================================================
// POST /api/play-sessions/guest/challenge-gods - ゲスト用 神々モードのセッション開始 (ステートレス)
// ========================================================

/**
 * ゲスト用神々モードのセッション開始リクエスト
 */
export const startGuestChallengeGodsRequestSchema = z.object({
  language_id: z.number().int().positive(),
})

/**
 * ゲスト用神々モードのセッション開始レスポンス
 * session_id は持たない。ghost_keystroke_logs を含む点は logged-in 版と同じ
 */
export const startGuestChallengeGodsResponseSchema = z.object({
  ghost_keystroke_logs: z.array(
    z.object({
      elapsed_ms: z.number().nonnegative(),
      input_char: z.string().min(1).max(20),
      is_correct: z.boolean(),
      problem_index: z.number().int().nonnegative().max(19),
    }),
  ),
  ghost_session_id: z.number().int().positive(),
  ghost_user_display: ghostUserDisplaySchema,
  problems: z.array(playSessionProblemSchema).length(20),
  repo_info: repoInfoSchema,
})

export type StartGuestChallengeGodsRequest = z.infer<typeof startGuestChallengeGodsRequestSchema>
export type StartGuestChallengeGodsResponse = z.infer<typeof startGuestChallengeGodsResponseSchema>

// ========================================================
// POST /api/play-sessions/guest/finish - ゲスト用 プレイ結果集計 (ステートレス)
// ========================================================

/**
 * ゲスト用 /finish のリクエスト
 * Redis state が無いため problem_ids をクライアントから受け取る
 */
export const finishGuestPlaySessionRequestSchema = z.object({
  accuracy: z.number().min(0).max(1),
  keystroke_logs: z.array(keystrokeEntrySchema).max(2000),
  /**
   * このセッションで実際に出題された problem.id を出題順 (orderIndex 順) で並べたもの
   * /guest/solo or /guest/challenge-gods のレスポンスをそのまま転送する想定
   * 正規フローでは常に 20 件だが、ゲストはランキングに影響しないため上限のみ強制する
   */
  problem_ids: z.array(z.number().int().positive()).min(1).max(20),
  typed_chars: z.number().int().nonnegative().max(1500),
})

/**
 * ゲスト用 /finish のレスポンス
 * 永続化はしないが、ゲストにも「このスコアなら何位か」を見せるために
 * 仮想 rank と総ランクイン人数を返す
 */
export const finishGuestPlaySessionResponseSchema = z.object({
  accuracy: z.number(),
  mistype_stats: mistypeStatsSchema,
  new_rank: z.number().int().positive().nullable(),
  problems_completed: z.number().int().nonnegative(),
  problems_played: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  total_ranked_players: z.number().int().nonnegative(),
  typed_chars: z.number().int().nonnegative(),
})

export type FinishGuestPlaySessionRequest = z.infer<typeof finishGuestPlaySessionRequestSchema>
export type FinishGuestPlaySessionResponse = z.infer<typeof finishGuestPlaySessionResponseSchema>
