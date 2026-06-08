import { computeGradeProgress } from "@/libs/grade"

type Props = {
    /**
     * 全言語通算ベストスコア（グレード判定の基準）
     */
    bestScore: number
    /**
     * 次グレード。Fellow 到達時は null（その場合はバーを描画しない）
     */
    nextGrade: { name: string; score_needed: number } | null
}

/**
 * エンジニアグレードの進捗バー（purple グラデーション）
 *
 * ResultScreen / MyPage / MyRankingSidebar の 3 箇所で再利用。
 * `next_grade=null`（Fellow 到達）の場合はバーを描画せず null を返す
 */
export function GradeProgressBar({ bestScore, nextGrade }: Props) {
  if (nextGrade === null) {
    return null
  }

  /**
   * lib/grade.ts の computeGradeProgress を再利用して current/next の threshold と
   * progress 比率を取得する。grade.slug がローカルテーブルに無い未知値でも
   * computeGradeProgress(bestScore) は bestScore 1 つから判定するので安全
   */
  const progress = computeGradeProgress(bestScore)
  const progressPercent = (Math.max(0, Math.min(1, progress.progress)) * 100).toFixed(1)
  const fromThreshold = progress.current.threshold
  const toThreshold = progress.next?.threshold ?? fromThreshold

  return (
    <>
      <div className="progress mb-8">
        <div
          className="progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="text-sm text-muted text-center">
        {fromThreshold} →{" "}
        <strong style={{ color: "var(--text-primary)" }}>{bestScore}</strong>{" "}
        → {toThreshold}{" "}
        <span style={{ color: "var(--gold-light)" }}>({nextGrade.name})</span>
      </div>
    </>
  )
}
