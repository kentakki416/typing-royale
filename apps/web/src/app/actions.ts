"use server"

import { StartChallengeGodsResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * セッション開始の共通レスポンス（mode 問わず）
 *
 * sessionStorage に詰める統一フォーマット。ghost 系は challenge_gods のみ持つ
 */
type StartSessionResult =
  | { error: string }
  | {
      ghostKeystrokeLogs: StartChallengeGodsResponse["ghost_keystroke_logs"] | null
      ghostSessionId: number | null
      ghostUserDisplay: StartChallengeGodsResponse["ghost_user_display"] | null
      mode: "challenge_gods" | "solo"
      problems: StartSoloPlaySessionResponse["problems"]
      repoInfo: StartSoloPlaySessionResponse["repo_info"]
      sessionId: string
    }

/**
 * セッション開始（通常モード / 神々モード共通の Server Action）
 *
 * mode に応じて /api/play-sessions/solo または /api/play-sessions/challenge-gods を叩く。
 * 神々モードは ranking_snapshots 未整備の現状では HTTP 409 になるため、その場合は
 * 専用エラーメッセージを返す。
 */
export const startPlaySession = async (
  languageId: number,
  mode: "challenge_gods" | "solo",
): Promise<StartSessionResult> => {
  if (mode === "challenge_gods") {
    try {
      const res = await apiClient.post<StartChallengeGodsResponse>(
        "/api/play-sessions/challenge-gods",
        { language_id: languageId },
      )
      return {
        ghostKeystrokeLogs: res.ghost_keystroke_logs,
        ghostSessionId: res.ghost_session_id,
        ghostUserDisplay: res.ghost_user_display,
        mode: "challenge_gods",
        problems: res.problems,
        repoInfo: res.repo_info,
        sessionId: res.session_id,
      }
    } catch {
      /**
       * apiClient はエラーで throw するだけで status を持たないため、現状はメッセージで割り切る。
       * Phase 4 (ranking_snapshots) 完成前は 409 が想定動作
       */
      return { error: "「神々に挑戦」は近日公開予定です（ランキング集計が整い次第有効化されます）。" }
    }
  }

  try {
    const res = await apiClient.post<StartSoloPlaySessionResponse>(
      "/api/play-sessions/solo",
      { language_id: languageId },
    )
    return {
      ghostKeystrokeLogs: null,
      ghostSessionId: null,
      ghostUserDisplay: null,
      mode: "solo",
      problems: res.problems,
      repoInfo: res.repo_info,
      sessionId: res.session_id,
    }
  } catch {
    return { error: "セッションを開始できませんでした。時間を空けて再試行してください。" }
  }
}
