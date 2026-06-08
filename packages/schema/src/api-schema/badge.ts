import { z } from "zod"

// ========================================================
// 共通定数
// ========================================================

const DISPLAY_ITEM_SLUGS = [
  "grade",
  "best_score",
  "rank",
  "streak_days",
  "typed_chars",
  "username",
] as const

// ========================================================
// GET /badge/:username.svg - 動的 SVG バッジ (公開)
// ========================================================

/**
 * GET /badge/:username.svg の path param
 *
 * username は GitHub username 互換 (英数 + `-` + `_`)。 拡張子 `.svg` は
 * Router 側で `:username.svg` として吸収するため Zod では検証しない
 */
export const getBadgeSvgPathParamSchema = z.object({
  username: z.string().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/),
})

export type GetBadgeSvgPathParam = z.infer<typeof getBadgeSvgPathParamSchema>

// ========================================================
// GET /api/user/badge-config - 自分のバッジ表示設定取得
// ========================================================

/**
 * GET / PUT 共通のレスポンス
 * テーマは持たず常に黒背景で統一
 */
export const getBadgeConfigResponseSchema = z.object({
  display_items: z.array(z.enum(DISPLAY_ITEM_SLUGS)),
  updated_at: z.string().datetime(),
})

export type GetBadgeConfigResponse = z.infer<typeof getBadgeConfigResponseSchema>

// ========================================================
// PUT /api/user/badge-config - 自分のバッジ表示設定更新
// ========================================================

/**
 * PUT のリクエスト
 */
export const updateBadgeConfigRequestSchema = z.object({
  display_items: z.array(z.enum(DISPLAY_ITEM_SLUGS)).min(1).max(5),
})

export type UpdateBadgeConfigRequest = z.infer<typeof updateBadgeConfigRequestSchema>
