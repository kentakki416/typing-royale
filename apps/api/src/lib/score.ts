import { KeystrokeLogs, MistypeStats } from "../types/domain"

/**
 * 物理的に到達不可能なスコアを弾くための上限
 * 120 秒 × 12 打鍵/秒 ≒ 1440 → 安全側で 1500 を採用
 */
const PHYSICAL_LIMIT_TYPED_CHARS = 1500

/**
 * keystroke_logs の生 JSON サイズ上限（DoS 防御）
 */
export const MAX_KEYSTROKE_LOG_BYTES = 100 * 1024

/**
 * サーバー権威スコア計算
 * floor で整数化することでユーザーに有利な丸めを防ぐ
 */
export const computeScore = (typedChars: number, accuracy: number): number => {
  return Math.floor(typedChars * accuracy)
}

/**
 * クライアント値が物理限界内かチェック
 */
export const isWithinPhysicalLimits = (typedChars: number, accuracy: number): boolean => {
  return (
    typedChars >= 0 &&
    typedChars <= PHYSICAL_LIMIT_TYPED_CHARS &&
    accuracy >= 0 &&
    accuracy <= 1
  )
}

/**
 * keystroke_logs から問題別の進捗（正解打鍵数 / 完走判定）を集計する
 *
 * クライアントの `isCorrect` は信用せず、サーバー側で
 * `inputChar === codeBlock[cursor]` で正誤判定する（嘘の log でスコアを
 * 水増しされないため）
 */
export const aggregateProblemProgress = (
  logs: KeystrokeLogs,
  problemCodeBlocks: Map<number, string>,
): Map<number, { charsTyped: number; completed: boolean }> => {
  const progress = new Map<number, { charsTyped: number; completed: boolean }>()

  for (const [orderIndex, codeBlock] of problemCodeBlocks) {
    let cursorPos = 0
    for (const entry of logs) {
      if (entry.problemIndex !== orderIndex) continue
      const expected = codeBlock[cursorPos]
      if (expected === undefined) break
      if (entry.inputChar === expected) cursorPos++
    }
    const charsTyped = cursorPos
    const completed = charsTyped >= codeBlock.length
    progress.set(orderIndex, { charsTyped, completed })
  }

  return progress
}

/**
 * keystroke_logs からニガテ文字（mistypeStats）を集計する
 *
 * ログには「押した文字 (inputChar)」しか入っておらず「期待されていた正解文字」は
 * 含まれない。そのため codeBlock と cursor（問題ごとの正解打鍵数）から
 * サーバー側で「そのとき期待されていた文字」を復元し、誤入力時にその期待文字を
 * +1 する。クライアントの `isCorrect` は信用せず、`inputChar === expected` で
 * サーバー権威に判定する（codeBlock はサーバー所有）
 *
 * 例: codeBlock="hello" / 打鍵 h→e→l→k(誤)→l→o
 *   cursor=3 のとき k が到着 → expected = code[3] = "l" → mistypeStats["l"] += 1
 */
export const aggregateMistypeStats = (
  logs: KeystrokeLogs,
  problemCodeBlocks: Map<number, string>,
): MistypeStats => {
  const mistypeStats: MistypeStats = {}

  /**
   * orderIndex ごとに「現在位置（次に期待する文字 index）」を持つ
   */
  const cursor = new Map<number, number>()
  for (const orderIndex of problemCodeBlocks.keys()) {
    cursor.set(orderIndex, 0)
  }

  for (const entry of logs) {
    const code = problemCodeBlocks.get(entry.problemIndex)
    if (!code) continue
    const pos = cursor.get(entry.problemIndex) ?? 0
    const expected = code[pos]
    /**
     * 末尾を超えたエントリは無視
     */
    if (expected === undefined) continue

    if (entry.inputChar === expected) {
      cursor.set(entry.problemIndex, pos + 1)
    } else {
      mistypeStats[expected] = (mistypeStats[expected] ?? 0) + 1
    }
  }

  return mistypeStats
}
