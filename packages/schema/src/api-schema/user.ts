import { z } from "zod"

/**
 * 共通の user オブジェクトスキーマ（GET / PATCH のレスポンスで共通利用）
 *
 * - display_name: GitHub username 等を初期値に持つ表示名
 * - can_public_ranking: false でランキング集計対象から完全除外（順位そのものを計算しない）
 */
const userSchema = z.object({
  avatar_url: z.string().nullable(),
  can_public_ranking: z.boolean(),
  created_at: z.string(),
  display_name: z.string().nullable(),
  email: z.string().nullable(),
  favorite_repo_url: z.string().nullable(),
  id: z.number(),
})

// ========================================================
// GET /api/user - 認証中ユーザーの取得
// ========================================================

/**
 * 認証中ユーザー取得のレスポンススキーマ
 */
export const getUserResponseSchema = userSchema

export type GetUserResponse = z.infer<typeof getUserResponseSchema>

// ========================================================
// PATCH /api/user - 認証中ユーザーの更新（表示名 / 公開設定）
// ========================================================

/**
 * 認証中ユーザー更新リクエストのスキーマ
 *
 * 全フィールドが optional だが、最低 1 つは渡す前提（refine で検証）。
 * display_name は 1〜50 文字に制限（前後 trim 済みを想定）。
 */
export const updateUserRequestSchema = z
  .object({
    can_public_ranking: z.boolean().optional(),
    display_name: z.string().trim().min(1).max(50).optional(),
    /**
     * プロフィール公開用のお気に入りリポジトリ URL。
     * null で空欄リセット、undefined で変更なし。汎用 URL を許容（github.com 限定にしない）
     */
    favorite_repo_url: z.string().trim().max(200).url().nullable().optional(),
  })
  .refine(
    (v) =>
      v.can_public_ranking !== undefined
      || v.display_name !== undefined
      || v.favorite_repo_url !== undefined,
    { message: "At least one field is required" },
  )

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>

/**
 * 認証中ユーザー更新レスポンスのスキーマ
 */
export const updateUserResponseSchema = userSchema

export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>

// ========================================================
// DELETE /api/user - アカウント削除（GDPR 即時削除）
// ========================================================

/**
 * アカウント削除レスポンスのスキーマ
 */
export const deleteUserResponseSchema = z.object({
  message: z.literal("OK"),
})

export type DeleteUserResponse = z.infer<typeof deleteUserResponseSchema>
