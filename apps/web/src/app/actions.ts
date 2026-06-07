"use server"

import { StartSoloPlaySessionResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 通常モードでセッションを開始する Server Action
 *
 * - /api/play-sessions/solo を叩いて { session_id, problems, repo_info } を取得
 * - 戻り値は呼び出し元の Client Component が sessionStorage に保存して
 *   /play/[sessionId] ページに渡す
 * - 「神々に挑戦」モードは step6 で /challenge-gods が実装されてから有効化
 */
export const startSoloPlaySession = async (
  languageId: number,
  mode: "challenge_gods" | "solo",
): Promise<
  | { error: string }
  | { problems: StartSoloPlaySessionResponse["problems"]; repoInfo: StartSoloPlaySessionResponse["repo_info"]; sessionId: string }
> => {
  if (mode === "challenge_gods") {
    return { error: "「神々に挑戦」は近日公開予定です。" }
  }

  try {
    const res = await apiClient.post<StartSoloPlaySessionResponse>(
      "/api/play-sessions/solo",
      { language_id: languageId },
    )
    return {
      problems: res.problems,
      repoInfo: res.repo_info,
      sessionId: res.session_id,
    }
  } catch {
    return { error: "セッションを開始できませんでした。時間を空けて再試行してください。" }
  }
}
