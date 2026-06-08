"use server"

import type { HallOfFameCommentResponse, SubmitHallOfFameCommentRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * リザルト画面の TOP 10 入りモーダルから送信されるコメント (Server Action)
 *
 * POST /api/hall-of-fame/comments を叩く。認証 cookie / Bearer JWT は apiClient が
 * 自動付与。サーバー側 (rewards step4) でベスト存在確認と NG ワードチェック済み
 */
export const submitHallOfFameCommentAction = async (
  input: SubmitHallOfFameCommentRequest,
): Promise<HallOfFameCommentResponse> => {
  return apiClient.post<HallOfFameCommentResponse>("/api/hall-of-fame/comments", input)
}
