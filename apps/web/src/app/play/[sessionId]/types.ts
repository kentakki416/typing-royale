import type { StartChallengeGodsResponse } from "@repo/api-schema"

export type GhostKeystrokeLogs = StartChallengeGodsResponse["ghost_keystroke_logs"]
export type GhostUserDisplay = StartChallengeGodsResponse["ghost_user_display"]

/**
 * PlayLoop が 120 秒終了時点で確定した神の進捗サマリ
 * ResultScreen が神々戦モーダルを描画するために使う
 */
export type GhostSummary = {
  accuracy: number
  perProblem: { completed: boolean; orderIndex: number; typedChars: number }[]
  problemIndex: number
  totalKeystrokes: number
  typedChars: number
}
