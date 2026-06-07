import { z } from "zod"

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
 * POST /api/play-sessions/solo - Request
 */
export const startSoloPlaySessionRequestSchema = z.object({
  language_id: z.number().int().positive(),
})

/**
 * POST /api/play-sessions/solo - Response
 */
export const startSoloPlaySessionResponseSchema = z.object({
  problems: z.array(playSessionProblemSchema).length(20),
  repo_info: repoInfoSchema,
  session_id: z.string().uuid(),
})

export type StartSoloPlaySessionRequest = z.infer<typeof startSoloPlaySessionRequestSchema>
export type StartSoloPlaySessionResponse = z.infer<typeof startSoloPlaySessionResponseSchema>
