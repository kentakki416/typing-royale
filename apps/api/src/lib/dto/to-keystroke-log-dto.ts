import type { KeystrokeEntry } from "../../types/domain"

/**
 * キーストロークログ 1 件をレスポンス用 snake_case object に詰め替える
 *
 * start-challenge-gods (`ghost_keystroke_logs`) / replay (`keystroke_logs`) で
 * 同じ shape を返すため共通化する。
 */
export const toKeystrokeLogDto = (entry: KeystrokeEntry) => ({
  elapsed_ms: entry.elapsedMs,
  input_char: entry.inputChar,
  is_correct: entry.isCorrect,
  problem_index: entry.problemIndex,
})
