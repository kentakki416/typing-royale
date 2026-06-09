/**
 * グレード 1 件の snake_case 詰め替え用 input
 *
 * `lib/grade.ts` の `Grade` (`threshold` を持つ) と `types/domain` の `FinishGrade` の
 * どちらでも受けられるよう、必要 3 フィールドのみを構造的に要求する。
 */
type GradeLike = {
    level: number
    name: string
    slug: string
}

/**
 * グレードをレスポンス用 snake_case object に詰め替える
 *
 * Ranking (`grade`) / Player (`lifetime_stats.current_grade`) /
 * PlaySession finish (`grade_up.from` / `grade_up.to`) で同じ shape を返すため共通化する。
 */
export const toGradeDto = (grade: GradeLike) => ({
  level: grade.level,
  name: grade.name,
  slug: grade.slug,
})
