"use server"

import { redirect } from "next/navigation"

import { UpdateUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * オンボーディングフォームの送信
 *
 * /mypage/account の更新と同じエンドポイントを使う（PATCH /api/user）。
 * 成功時はホームへリダイレクトする。
 */
export const submitOnboardingAction = async (
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> => {
  const displayNameRaw = formData.get("display_name")
  const canPublicRankingRaw = formData.get("can_public_ranking")

  const displayName = typeof displayNameRaw === "string" ? displayNameRaw.trim() : ""
  const canPublicRanking = canPublicRankingRaw === "on" || canPublicRankingRaw === "true"

  if (displayName.length < 1 || displayName.length > 50) {
    return { error: "表示名は 1〜50 文字で入力してください。" }
  }

  try {
    await apiClient.patch<UpdateUserResponse>("/api/user", {
      can_public_ranking: canPublicRanking,
      display_name: displayName,
    })
  } catch {
    return { error: "保存に失敗しました。もう一度お試しください。" }
  }

  redirect("/")
}
