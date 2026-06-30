import { MistypeStats } from "../types/domain"

/**
 * 内訳が復元できない（legacy flat 由来）ことを表すキー。
 * 旧 `Record<string, number>` 形式のデータは「実際に打った文字」が記録されていないため、
 * 正規化時にこのキーへ寄せる。
 */
export const UNKNOWN_ACTUAL = "?"

/**
 * 保存済み JSON（flat or nested の混在）を nested の MistypeStats に正規化する。
 *
 * - value が number（旧 flat）→ `{ [UNKNOWN_ACTUAL]: number }`
 * - value が object（新 nested）→ 数値の内訳だけ採用
 * - それ以外（null / 文字列等）→ 無視
 */
export const normalizeMistypeStats = (raw: unknown): MistypeStats => {
  const result: MistypeStats = {}
  if (raw === null || typeof raw !== "object") {
    return result
  }
  for (const [expected, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number") {
      result[expected] = { [UNKNOWN_ACTUAL]: value }
    } else if (value !== null && typeof value === "object") {
      const inner: Record<string, number> = {}
      for (const [actual, count] of Object.entries(value as Record<string, unknown>)) {
        if (typeof count === "number") {
          inner[actual] = count
        }
      }
      result[expected] = inner
    }
  }
  return result
}

/**
 * 期待文字 1 件の合計誤打数（内訳の総和）
 */
export const totalMistypeCount = (inner: Record<string, number>): number =>
  Object.values(inner).reduce((sum, n) => sum + n, 0)

/**
 * 2 つの nested stats を破壊せずマージする（生涯加算 / バックフィルで共有）
 */
export const mergeMistypeStats = (base: MistypeStats, add: MistypeStats): MistypeStats => {
  const result: MistypeStats = structuredClone(base)
  for (const [expected, inner] of Object.entries(add)) {
    const target = (result[expected] ??= {})
    for (const [actual, count] of Object.entries(inner)) {
      target[actual] = (target[actual] ?? 0) + count
    }
  }
  return result
}
