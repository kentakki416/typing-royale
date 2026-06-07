import { KeystrokeLog, MistypeStats } from "../types/domain"

/**
 * 物理的に到達不可能なスコアを弾くための上限
 * 120 秒 × 12 打鍵/秒 ≒ 1440 → 安全側で 1500 を採用
 */
export const PHYSICAL_LIMIT_TYPED_CHARS = 1500

/**
 * keystroke_log の生 JSON サイズ上限（DoS 防御）
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
 * keystroke_log から問題別の進捗を集計
 *
 * problemCodeBlocks: orderIndex (0..19) → codeBlock の Map
 * 各 orderIndex について「正解打鍵数」「完走したか（末尾文字に到達したか）」を返す
 */
export const aggregateProblemProgress = (
  log: KeystrokeLog,
  problemCodeBlocks: Map<number, string>,
): Map<number, { charsTyped: number; completed: boolean }> => {
  const progress = new Map<number, { charsTyped: number; completed: boolean }>()

  for (const [orderIndex, codeBlock] of problemCodeBlocks) {
    const entries = log.filter((e) => e.p === orderIndex)
    const correctEntries = entries.filter((e) => e.ok)
    const charsTyped = correctEntries.length
    /**
     * 完走判定: 正解打鍵数が codeBlock の長さに到達したか
     */
    const completed = charsTyped >= codeBlock.length
    progress.set(orderIndex, { charsTyped, completed })
  }

  return progress
}

/**
 * keystroke_log からニガテ文字（mistypeStats）を集計
 *
 * 「ok=false の打鍵について、そのとき期待されていた正解文字を 1 加算」
 * 期待文字は問題の codeBlock の「現在位置」から引く
 */
export const aggregateMistypeStats = (
  log: KeystrokeLog,
  problemCodeBlocks: Map<number, string>,
): MistypeStats => {
  const stats: MistypeStats = {}

  /**
   * orderIndex ごとに「現在位置（次に期待する文字 index）」を持つ
   */
  const cursor = new Map<number, number>()
  for (const orderIndex of problemCodeBlocks.keys()) {
    cursor.set(orderIndex, 0)
  }

  for (const entry of log) {
    const code = problemCodeBlocks.get(entry.p)
    if (!code) continue
    const pos = cursor.get(entry.p) ?? 0
    const expected = code[pos]
    /**
     * 末尾を超えたエントリは無視
     */
    if (expected === undefined) continue

    if (entry.ok) {
      cursor.set(entry.p, pos + 1)
    } else {
      /**
       * 正解期待文字をキーに 1 加算
       */
      stats[expected] = (stats[expected] ?? 0) + 1
    }
  }

  return stats
}
