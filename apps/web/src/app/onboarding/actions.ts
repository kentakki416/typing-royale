"use server"

import { redirect } from "next/navigation"

import { UpdateUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * オンボーディングフォームの送信。 表示名は GitHub username 固定で編集不可、
 * ここで決められるのは「ランキングに掲載するかどうか」のみ。 PATCH /api/user で
 * 反映し、 成功時はホームへリダイレクトする
 */
export const submitOnboardingAction = async (
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> => {
  const canPublicRankingRaw = formData.get("can_public_ranking")
  const canPublicRanking = canPublicRankingRaw === "on" || canPublicRankingRaw === "true"

  try {
    await apiClient.patch<UpdateUserResponse>("/api/user", {
      can_public_ranking: canPublicRanking,
    })
  } catch {
    return { error: "保存に失敗しました。もう一度お試しください。" }
  }

  redirect("/")
}
