"use server"

import { revalidatePath } from "next/cache"

import type { HallOfFameCommentResponse, UpdateHallOfFameCommentRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * マイページのコメント編集タブから呼ばれる Server Action
 *
 * PATCH /api/hall-of-fame/comments/:entryId を叩く。サーバー側で所有者検証 + NG ワード判定
 */
export const updateHallOfFameCommentAction = async (input: {
    comment: string
    entryId: number
}): Promise<HallOfFameCommentResponse> => {
  const body: UpdateHallOfFameCommentRequest = { comment: input.comment }
  const res = await apiClient.patch<HallOfFameCommentResponse>(
    `/api/hall-of-fame/comments/${input.entryId}`,
    body,
  )
  revalidatePath("/mypage/hall-of-fame-comments")
  return res
}
