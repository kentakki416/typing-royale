/**
 * 採用サイズの上下限。
 * 旧値 (100-400 chars / 5-25 行) は「3 行ラッパー関数」が大量に通り、
 * OSS のプレイ感が薄かったため引き上げ。下限は「実質的なロジックを含む」、
 * 上限は「120 秒セッションで複数問こなせる」のバランスで設定。
 */
const MIN_CHAR_COUNT = 200
const MAX_CHAR_COUNT = 700
const MIN_LINE_COUNT = 8
const MAX_LINE_COUNT = 40
const MAX_LINE_LENGTH = 120

export type AdoptionResult =
  | { adopted: true; charCount: number; lineCount: number }
  | { adopted: false; reason: AdoptionRejectReason }

export type AdoptionRejectReason =
  | "char_count_out_of_range"
  | "empty_after_strip"
  | "excluded_function_name"
  | "line_count_out_of_range"
  | "line_too_long"
  | "non_ascii"

/**
 * 抽出した関数を problem として採用するかを判定する関数
 *
 * 仕様（docs/spec/problem-pool/README.md「採用条件（関数の足切り）」）:
 *   - 文字数（コメント除去後 + trim）: 200〜700 文字
 *   - 行数: 8〜40 行
 *   - 1 行最大文字数: 120 文字以下
 *   - 非 ASCII 文字: 0 文字（日本語コメント混入や非 ASCII 識別子を除外）
 *   - 関数名: 存在する（テストフレームワーク予約名等の言語固有除外は LanguageExtractor.isExcludedName 側）
 *   - コメント除去後本文: 空でない
 */
export const checkAdoption = (functionName: string, codeWithoutCommnet: string): AdoptionResult => {
  if (!functionName) {
    return { adopted: false, reason: "excluded_function_name" }
  }
  const trimmed = codeWithoutCommnet.trim()
  if (trimmed.length === 0) {
    return { adopted: false, reason: "empty_after_strip" }
  }
  const charCount = trimmed.length
  if (charCount < MIN_CHAR_COUNT || charCount > MAX_CHAR_COUNT) {
    return { adopted: false, reason: "char_count_out_of_range" }
  }
  const lines = trimmed.split("\n")
  if (lines.length < MIN_LINE_COUNT || lines.length > MAX_LINE_COUNT) {
    return { adopted: false, reason: "line_count_out_of_range" }
  }
  if (lines.some((l) => l.length > MAX_LINE_LENGTH)) {
    return { adopted: false, reason: "line_too_long" }
  }

  if (/[^\x00-\x7F]/.test(trimmed)) {
    return { adopted: false, reason: "non_ascii" }
  }
  return { adopted: true, charCount, lineCount: lines.length }
}
