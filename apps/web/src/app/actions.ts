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
 * 神々モードはトップ 10 不在 / ゴーストデータ取得不能時に HTTP 409 を返し、
 * その場合は通常モードへ誘導するエラーメッセージを表示する。
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
       * apiClient はエラーで throw するだけで status を持たないため、メッセージで割り切る
       */
      return { error: "対戦相手の神を準備できませんでした。通常プレイを試すか、しばらく経ってから再度お試しください。" }
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
