"use server"

import { revalidatePath } from "next/cache"

import type { GetBadgeConfigResponse, UpdateBadgeConfigRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * バッジ設定の更新 (Server Action)
 *
 * BadgeForm Client Component から呼ばれ、PUT /api/user/badge-config を叩く。
 * 認証 cookie / Bearer JWT は apiClient が自動付与
 */
export const updateBadgeConfigAction = async (input: {
    displayItems: UpdateBadgeConfigRequest["display_items"]
}): Promise<GetBadgeConfigResponse> => {
  const body: UpdateBadgeConfigRequest = {
    display_items: input.displayItems,
  }
  const res = await apiClient.put<GetBadgeConfigResponse>("/api/user/badge-config", body)
  revalidatePath("/mypage/rewards")
  return res
}
