"use server"

import { redirect } from "next/navigation"

import { updateUserResponseSchema, UpdateUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { clearAuthCookies } from "@/libs/auth"

/**
 * 表示名 / ランキング公開設定の更新
 *
 * フォーム経由で呼ばれる。Zod の trim/長さ制約は API 側でも検証されるが、
 * ここでも軽くガードしてサーバー往復を減らす。
 */
export const updateProfileAction = async (
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean; user?: UpdateUserResponse }> => {
  const displayNameRaw = formData.get("display_name")
  const canPublicRankingRaw = formData.get("can_public_ranking")

  const displayName = typeof displayNameRaw === "string" ? displayNameRaw.trim() : undefined
  const canPublicRanking = canPublicRankingRaw === "on" || canPublicRankingRaw === "true"

  if (displayName !== undefined && (displayName.length < 1 || displayName.length > 50)) {
    return { error: "表示名は 1〜50 文字で入力してください。" }
  }

  try {
    const updated = await apiClient.patch<UpdateUserResponse>("/api/user", {
      can_public_ranking: canPublicRanking,
      display_name: displayName,
    })
    return { success: true, user: updateUserResponseSchema.parse(updated) }
  } catch {
    return { error: "更新に失敗しました。" }
  }
}

/**
 * アカウント削除
 *
 * API 側で User をハード削除し、FK Cascade で AuthAccount や将来のスコア類も
 * 連動削除される。Redis 上の refresh token も deleteAllByUserId で失効。
 * 削除後は cookie をクリアして /sign-in にリダイレクトする。
 */
export const deleteAccountAction = async () => {
  try {
    await apiClient.delete("/api/user")
  } finally {
    await clearAuthCookies()
  }
  redirect("/sign-in")
}
