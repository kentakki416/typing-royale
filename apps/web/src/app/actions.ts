"use server"

import { randomUUID } from "node:crypto"

import {
  LanguageItem,
  StartChallengeGodsResponse,
  StartGuestChallengeGodsResponse,
  StartGuestSoloPlaySessionResponse,
  StartSoloPlaySessionResponse,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"
import { getLanguages } from "@/libs/languages"

/**
 * セッション開始の共通レスポンス（mode 問わず）
 *
 * sessionStorage に詰める統一フォーマット。ghost 系は challenge_gods のみ持つ。
 * `isGuest` は /finish 呼び出し時に endpoint を切り替えるためにクライアントが参照する。
 * `problemIds` はゲスト用 /finish のリクエストボディに転送する。
 */
type StartSessionResult =
  | { error: string }
  | {
      ghostKeystrokeLogs: StartChallengeGodsResponse["ghost_keystroke_logs"] | null
      ghostSessionId: number | null
      ghostUserDisplay: StartChallengeGodsResponse["ghost_user_display"] | null
      isGuest: boolean
      /**
       * プレイ中バッジ・リザルトの言語表示・グレード進捗フェッチに使う言語マスタ。
       * languageId から解決する。マスタ取得に失敗した場合のみ null。
       */
      language: LanguageItem | null
      mode: "challenge_gods" | "solo"
      problemIds: number[]
      problems: StartSoloPlaySessionResponse["problems"]
      repoInfo: StartSoloPlaySessionResponse["repo_info"]
      sessionId: string
    }

/**
 * セッション開始（通常モード / 神々モード共通の Server Action）
 *
 * ログイン状態と mode で 4 通りの endpoint を叩き分ける:
 * - ログイン × solo:           POST /api/play-sessions/solo
 * - ログイン × challenge_gods: POST /api/play-sessions/challenge-gods
 * - ゲスト × solo:             POST /api/play-sessions/guest/solo
 * - ゲスト × challenge_gods:   POST /api/play-sessions/guest/challenge-gods
 *
 * ゲスト用 endpoint は session_id を返さないため、クライアント側ルーティング用に
 * UUID を発行する（sessionStorage のキーと /play/[sessionId] のパスに使うだけで
 * サーバーには送らない）。
 */
export const startPlaySession = async (
  languageId: number,
  mode: "challenge_gods" | "solo",
): Promise<StartSessionResult> => {
  const isGuest = (await getAccessToken()) === null
  /**
   * 各エントリポイント（言語選択 / ランキング / 殿堂入りボタン）は languageId しか
   * 持たないため、ここで言語マスタ（キャッシュ済み）を引いて slug/name を解決し、
   * sessionStorage 経由で play-loop / result-screen まで伝搬させる。
   */
  const language = (await getLanguages()).find((lang) => lang.id === languageId) ?? null

  if (mode === "challenge_gods") {
    try {
      if (isGuest) {
        const res = await apiClient.post<StartGuestChallengeGodsResponse>(
          "/api/play-sessions/guest/challenge-gods",
          { language_id: languageId },
        )
        return {
          ghostKeystrokeLogs: res.ghost_keystroke_logs,
          ghostSessionId: res.ghost_session_id,
          ghostUserDisplay: res.ghost_user_display,
          isGuest: true,
          language,
          mode: "challenge_gods",
          problemIds: res.problems.map((p) => p.id),
          problems: res.problems,
          repoInfo: res.repo_info,
          sessionId: randomUUID(),
        }
      }

      const res = await apiClient.post<StartChallengeGodsResponse>(
        "/api/play-sessions/challenge-gods",
        { language_id: languageId },
      )
      return {
        ghostKeystrokeLogs: res.ghost_keystroke_logs,
        ghostSessionId: res.ghost_session_id,
        ghostUserDisplay: res.ghost_user_display,
        isGuest: false,
        language,
        mode: "challenge_gods",
        problemIds: res.problems.map((p) => p.id),
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
    if (isGuest) {
      const res = await apiClient.post<StartGuestSoloPlaySessionResponse>(
        "/api/play-sessions/guest/solo",
        { language_id: languageId },
      )
      return {
        ghostKeystrokeLogs: null,
        ghostSessionId: null,
        ghostUserDisplay: null,
        isGuest: true,
        language,
        mode: "solo",
        problemIds: res.problems.map((p) => p.id),
        problems: res.problems,
        repoInfo: res.repo_info,
        sessionId: randomUUID(),
      }
    }

    const res = await apiClient.post<StartSoloPlaySessionResponse>(
      "/api/play-sessions/solo",
      { language_id: languageId },
    )
    return {
      ghostKeystrokeLogs: null,
      ghostSessionId: null,
      ghostUserDisplay: null,
      isGuest: false,
      language,
      mode: "solo",
      problemIds: res.problems.map((p) => p.id),
      problems: res.problems,
      repoInfo: res.repo_info,
      sessionId: res.session_id,
    }
  } catch {
    return { error: "セッションを開始できませんでした。時間を空けて再試行してください。" }
  }
}
