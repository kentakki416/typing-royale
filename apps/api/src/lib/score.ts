import { KeystrokeLogs, MistypeStats } from "../types/domain"

/**
 * 物理的に到達不可能なスコアを弾くための上限
 * 120 秒 × 12 打鍵/秒 ≒ 1440 → 安全側で 1500 を採用
 */
export const PHYSICAL_LIMIT_TYPED_CHARS = 1500

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
 * keystroke_logs から問題別の進捗を集計
 *
 * problemCodeBlocks: orderIndex (0..19) → codeBlock の Map
 * 各 orderIndex について「正解打鍵数」「完走したか（末尾文字に到達したか）」を返す
 */
export const aggregateProblemProgress = (
  logs: KeystrokeLogs,
  problemCodeBlocks: Map<number, string>,
): Map<number, { charsTyped: number; completed: boolean }> => {
  const progress = new Map<number, { charsTyped: number; completed: boolean }>()

  for (const [orderIndex, codeBlock] of problemCodeBlocks) {
    const entries = logs.filter((e) => e.problemIndex === orderIndex)
    const correctEntries = entries.filter((e) => e.isCorrect)
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
 * keystroke_logs からニガテ文字（mistypeStats）を集計
 *
 * 「isCorrect=false の打鍵について、そのとき期待されていた正解文字を 1 加算」
 * 期待文字は問題の codeBlock の「現在位置」から引く
 *
 * ──────────────────────────────────────────────────────────────────
 * なぜ cursor が必要か:
 * ──────────────────────────────────────────────────────────────────
 * KeystrokeEntry には「押した文字 (inputChar) と正誤 (isCorrect)」だけが
 * 入っており、「そのとき期待されていた正解文字」は記録されていない。
 *
 * 苦手文字集計でほしいのは「**何の文字を打つべきだったときに失敗したか**」
 * （= 期待文字）なので、押した文字 inputChar は使えない。
 *
 * 期待文字は codeBlock の中にあるので、「今その問題の何文字目を打とうと
 * していたか」が分かれば codeBlock[N] で引ける。それを問題ごとに追跡する
 * のが cursor。仕様：正解で +1、誤入力では据え置き（正しい文字が打たれる
 * まで進まない）
 *
 * 例: codeBlock="hello" / 打鍵 h→e→l→k(誤)→l→o
 *   ・cursor=3 のとき k が来る → expected = code[3] = "l"
 *   ・mistypeStats["l"] += 1（k ではなく l が記録される）
 *
 * クライアントに expectedChar を計算させて送ってもらう設計もあり得るが、
 * (1) データサイズ削減 (2) クライアント不正に強い（codeBlock はサーバー
 * 側にあり、誤りを混ぜたログを送られても期待文字はサーバー権威で確定
 * する）という観点から、サーバー再生方式を採用している
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

    if (entry.isCorrect) {
      cursor.set(entry.problemIndex, pos + 1)
    } else {
      /**
       * 正解期待文字をキーに 1 加算
       */
      mistypeStats[expected] = (mistypeStats[expected] ?? 0) + 1
    }
  }

  return mistypeStats
}
