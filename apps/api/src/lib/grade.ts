/**
 * エンジニアグレード（スコアによる絶対的な進歩指標）
 *
 * 評価軸は user_lifetime_stats.bestScore（全言語通算）。
 * 詳細は docs/spec/score-ranking/README.md「エンジニアグレード」参照
 */
export type Grade = {
    level: number
    name: string
    slug: string
    /**
     * このグレードに到達するための最低ベストスコア
     */
    threshold: number
}

export const GRADES: readonly Grade[] = [
  { level: 1, name: "Intern", slug: "intern", threshold: 0 },
  { level: 2, name: "Junior Developer", slug: "junior", threshold: 100 },
  { level: 3, name: "Mid Developer", slug: "mid", threshold: 250 },
  { level: 4, name: "Senior Engineer", slug: "senior", threshold: 400 },
  { level: 5, name: "Staff Engineer", slug: "staff", threshold: 600 },
  { level: 6, name: "Principal Engineer", slug: "principal", threshold: 800 },
  { level: 7, name: "Distinguished Engineer", slug: "distinguished", threshold: 1000 },
  { level: 8, name: "Fellow", slug: "fellow", threshold: 1200 },
]

/**
 * ベストスコアからグレードを判定する（降格なし、最高閾値を返す）
 */
export const calcGrade = (bestScore: number): Grade => {
  const reversed = [...GRADES].reverse()
  return reversed.find((g) => bestScore >= g.threshold) ?? GRADES[0]
}

/**
 * 次のグレード（Fellow なら null）
 */
export const calcNextGrade = (current: Grade): Grade | null => {
  const idx = GRADES.findIndex((g) => g.level === current.level + 1)
  return idx >= 0 ? GRADES[idx] : null
}
