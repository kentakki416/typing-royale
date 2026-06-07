/**
 * エンジニアグレードの判定と次グレード進捗の計算（純粋関数）
 *
 * 閾値の正本は docs/spec/score-ranking/README.md。
 * lifetime-stats API が実装された後はそちらから current_grade / best_score を
 * 受け取って表示する想定（本ライブラリは Web 側の暫定計算用）
 */

export type Grade = {
    level: number
    name: string
    /**
     * このグレードに到達するための最低ベストスコア
     */
    threshold: number
}

export const GRADES: readonly Grade[] = [
  { level: 1, name: "Intern", threshold: 0 },
  { level: 2, name: "Junior Developer", threshold: 100 },
  { level: 3, name: "Mid Developer", threshold: 250 },
  { level: 4, name: "Senior Engineer", threshold: 400 },
  { level: 5, name: "Staff Engineer", threshold: 600 },
  { level: 6, name: "Principal Engineer", threshold: 800 },
  { level: 7, name: "Distinguished Engineer", threshold: 1000 },
  { level: 8, name: "Fellow", threshold: 1200 },
]

export type GradeProgress = {
    current: Grade
    /**
     * 次のグレード。current が Fellow なら null
     */
    next: Grade | null
    /**
     * 次グレードまでの必要 pts。current が Fellow なら null
     */
    pointsToNext: number | null
    /**
     * 現グレード閾値から次グレード閾値までの達成率（0〜1）。Fellow なら 1
     */
    progress: number
}

/**
 * ベストスコアからグレード進捗を計算する
 */
export const computeGradeProgress = (bestScore: number): GradeProgress => {
  const reversed = [...GRADES].reverse()
  const current = reversed.find((g) => bestScore >= g.threshold) ?? GRADES[0]
  const nextIndex = GRADES.findIndex((g) => g.level === current.level + 1)
  const next = nextIndex >= 0 ? GRADES[nextIndex] : null

  if (next === null) {
    return { current, next: null, pointsToNext: null, progress: 1 }
  }

  const spread = next.threshold - current.threshold
  const progress = spread === 0 ? 0 : Math.min(1, (bestScore - current.threshold) / spread)
  return {
    current,
    next,
    pointsToNext: next.threshold - bestScore,
    progress,
  }
}

/**
 * Grade.name → mock CSS の .badge-grade.{slug} クラス
 */
export const gradeBadgeClass = (gradeName: string): string => {
  const map: Record<string, string> = {
    "Distinguished Engineer": "distinguished",
    "Fellow": "fellow",
    "Intern": "intern",
    "Junior Developer": "junior",
    "Mid Developer": "mid",
    "Principal Engineer": "principal",
    "Senior Engineer": "senior",
    "Staff Engineer": "staff",
  }
  return map[gradeName] ?? "intern"
}
