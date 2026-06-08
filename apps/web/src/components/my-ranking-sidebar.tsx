import Link from "next/link"

import type { GetMyRankingResponse } from "@repo/api-schema"

import { computeGradeProgress, gradeBadgeClass } from "@/libs/grade"

type Props = {
    language: "javascript" | "typescript"
    me: GetMyRankingResponse | null
    totalPlayers: number
}

const LANGUAGE_LABELS: Record<Props["language"], string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
}

/**
 * /ranking 画面右ペイン「あなたの状況」カード
 *
 * 表示パターン:
 * - 未ログイン (me === null): ログイン誘導
 * - ベスト未保存 (me.rank === null): プレイ誘導
 * - 通常: 自分の順位 + グレード + 次グレードまでの進捗バー
 *
 * デザイン: docs/mocks/ranking.html の sidebar「あなたの状況」
 */
export function MyRankingSidebar({ language, me, totalPlayers }: Props) {
  const langLabel = LANGUAGE_LABELS[language]

  if (me === null) {
    return (
      <div className="card mb-16">
        <div className="card-header">
          <div className="card-title">あなたの状況</div>
        </div>
        <p className="text-sm text-muted text-center mb-16">
          ログインするとあなたの順位とグレードが表示されます
        </p>
        <Link className="btn btn-primary btn-block" href="/sign-in">
          GitHub でログイン
        </Link>
      </div>
    )
  }

  if (me.rank === null || me.best_score === null) {
    return (
      <div className="card mb-16">
        <div className="card-header">
          <div className="card-title">あなたの状況</div>
        </div>
        <p className="text-sm text-muted text-center mb-16">
          {langLabel} はまだプレイ履歴がありません
        </p>
        <Link className="btn btn-primary btn-play btn-block" href="/play">
          ▶ プレイしてランクアップ
        </Link>
      </div>
    )
  }

  const progress = computeGradeProgress(me.best_score)
  const progressPercent = Math.max(0, Math.min(1, progress.progress)) * 100

  return (
    <div className="card mb-16">
      <div className="card-header">
        <div className="card-title">あなたの状況</div>
      </div>
      <div className="text-center mb-16">
        <div
          className="text-mono"
          style={{ color: "var(--accent)", fontSize: "36px", fontWeight: 700 }}
        >
          #{me.rank}
        </div>
        <div className="text-sm text-muted">
          {langLabel} · 全期間 / {totalPlayers.toLocaleString()} 人中
        </div>
      </div>
      <div className="text-center mb-16">
        <span
          className={`badge-grade ${gradeBadgeClass(me.grade.name)}`}
          data-level={me.grade.level}
        >
          {me.grade.name}
        </span>
      </div>
      <div className="text-sm">
        <div className="flex-between mb-8">
          <span className="text-muted">ベストスコア</span>
          <span className="text-mono">{me.best_score.toLocaleString()} pts</span>
        </div>
        {me.next_grade !== null && (
          <div className="flex-between">
            <span className="text-muted">
              次の <strong style={{ color: "var(--gold-light)" }}>{me.next_grade.name}</strong> まで
            </span>
            <span className="text-mono" style={{ color: "var(--gold)" }}>
              あと {me.next_grade.score_needed} pts
            </span>
          </div>
        )}
      </div>
      {me.next_grade !== null && progress.next !== null && (
        <>
          <div className="progress mt-8">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent.toFixed(1)}%` }}
            />
          </div>
          <div className="text-sm text-muted text-center mt-8">
            {progress.current.threshold} ←{" "}
            <strong style={{ color: "var(--text-primary)" }}>{me.best_score}</strong>{" "}
            → {progress.next.threshold}
          </div>
        </>
      )}
    </div>
  )
}
