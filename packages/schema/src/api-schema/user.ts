import { z } from "zod"

/**
 * 共通の user オブジェクトスキーマ（GET / PATCH のレスポンスで共通利用）
 *
 * - github_username: GitHub OAuth ログイン時に取得した username (login)。 表示は `@<username>`。
 *   dev-login ユーザーや GitHub OAuth 以前のユーザーは null
 * - can_public_ranking: false でランキング集計対象から完全除外（順位そのものを計算しない）
 */
const userSchema = z.object({
  avatar_url: z.string().nullable(),
  can_public_ranking: z.boolean(),
  created_at: z.string(),
  email: z.string().nullable(),
  favorite_repo_url: z.string().nullable(),
  github_username: z.string().nullable(),
  id: z.number(),
})

// ========================================================
// GET /api/user - 認証中ユーザーの取得
// ========================================================

/**
 * 苦手文字 1 件（生涯通算の文字ごと誤打数）
 */
const weakCharSchema = z.object({
  char: z.string(),
  count: z.number().int().nonnegative(),
})

/**
 * 得意なリポジトリ（自分の play_session を repo ごとに集計し、平均スコアが最高の repo）
 */
const bestRepoSchema = z.object({
  avg_score: z.number().nonnegative(),
  full_name: z.string(),
})

/**
 * 認証中ユーザー取得のレスポンススキーマ。
 * マイページのサマリー用に avg_accuracy / best_repo / weak_chars（苦手文字 top N）を含める。
 */
export const getUserResponseSchema = userSchema.extend({
  /** 全 play_session の平均正確率（0〜1）。プレイ実績が無ければ 0 */
  avg_accuracy: z.number().min(0).max(1),
  /** 得意なリポジトリ（平均スコア最高）。プレイ実績が無ければ null */
  best_repo: bestRepoSchema.nullable(),
  weak_chars: z.array(weakCharSchema),
})

export type GetUserResponse = z.infer<typeof getUserResponseSchema>

// ========================================================
// PATCH /api/user - 認証中ユーザーの更新（表示名 / 公開設定）
// ========================================================

/**
 * 認証中ユーザー更新リクエストのスキーマ
 *
 * 表示名はもう編集できない (GitHub login で固定)。 マイページから編集できるのは
 * 公開設定とお気に入りリポジトリ URL のみ。全フィールド optional だが最低 1 つ必要
 */
export const updateUserRequestSchema = z
  .object({
    can_public_ranking: z.boolean().optional(),
    /**
     * プロフィール公開用のお気に入りリポジトリ URL。
     * null で空欄リセット、undefined で変更なし。汎用 URL を許容（github.com 限定にしない）。
     * ただしスキームは http(s) のみに限定する（`javascript:` / `data:` 等を弾く＝公開
     * プロフィールでの stored XSS 防止。`.url()` だけでは javascript: スキームを通すため）。
     */
    favorite_repo_url: z
      .string()
      .trim()
      .max(200)
      .url()
      .refine((value) => /^https?:\/\//i.test(value), {
        message: "favorite_repo_url must be an http(s) URL",
      })
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.can_public_ranking !== undefined
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
