/**
 * NG ワード固定リストフィルタ（MVP）
 *
 * docs/spec/rewards/step4-api-hall-of-fame.md「NG ワードチェック」参照。
 * 本格的な ML / 外部 API 連動は別 PR。本 step は固定リスト + 単純な小文字 contains 判定で十分
 *
 * 直接的な暴言 / 脅迫 / 違法行為示唆を最低限カバー
 */
const NG_WORDS = [
  "死ね",
  "殺す",
  "殺害",
  "クズ",
  "ゴミ",
  "fuck",
  "shit",
  "kill you",
] as const

/**
 * 文字列に NG ワードが含まれているかを判定する
 * 比較は小文字化した上で部分一致
 */
export const containsNgWord = (text: string): boolean => {
  const normalized = text.toLowerCase()
  return NG_WORDS.some((w) => normalized.includes(w.toLowerCase()))
}
