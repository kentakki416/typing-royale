"use client"

import { useState } from "react"

import type { GetMonthlyRankingsResponse } from "@repo/api-schema"

import { RankingPlayerModal } from "@/app/ranking/ranking-player-modal"
import { formatPlayedAtShort } from "@/libs/format-date"

type Entry = GetMonthlyRankingsResponse["entries"][number]

type Props = {
    entries: Entry[]
    languageName: string
    languageSlug: string
}

type Selected = {
    rank: number
    userId: number
}

/**
 * 言語別「今月の」ランキングテーブル (TOP 10)。
 *
 * 月間スナップショット (`monthly_ranking_snapshots`) に保存されているフィールド
 * (rank / user / score / accuracy / played_at) を表示する。行（プレイヤー）を
 * クリックすると殿堂入りと共通の {@link RankingPlayerModal} を開き、選択時の表示
 * 内容を殿堂入りと統一する（見せ方だけプレーンなモーダルに変える）。
 */
export function RankingTable({ entries, languageName, languageSlug }: Props) {
  const [selected, setSelected] = useState<Selected | null>(null)

  if (entries.length === 0) return null

  return (
    <>
      <div className="card mb-16">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "48px" }}>順位</th>
              <th>プレイヤー</th>
              <th>グレード</th>
              <th className="numeric">スコア</th>
              <th className="numeric">正確率</th>
              <th className="numeric">達成日</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={`${e.rank}-${e.user.id}`}>
                <td>
                  <span className={`rank-badge ${convertRankToMedalClass(e.rank)}`}>#{e.rank}</span>
                </td>
                <td>
                  <div className="player-cell">
                    <PlayerAvatar entry={e} />
                    <button
                      className="link-button"
                      onClick={() => setSelected({ rank: e.rank, userId: e.user.id })}
                      type="button"
                    >
                      <strong>@{e.user.github_username ?? `user${e.user.id}`}</strong>
                    </button>
                  </div>
                </td>
                <td>
                  <span
                    className={`badge-grade ${e.user.current_grade}`}
                    data-level={convertGradeSlugToLevel(e.user.current_grade)}
                  >
                    {capitalizeGradeSlug(e.user.current_grade)}
                  </span>
                </td>
                <td className="numeric"><strong>{e.score.toLocaleString()}</strong></td>
                <td className="numeric">{(e.accuracy * 100).toFixed(1)}%</td>
                <td className="numeric text-muted text-sm">{formatPlayedAtShort(e.played_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected !== null && (
        <RankingPlayerModal
          key={selected.userId}
          languageName={languageName}
          languageSlug={languageSlug}
          onClose={() => setSelected(null)}
          rank={selected.rank}
          userId={selected.userId}
        />
      )}
    </>
  )
}

const convertRankToMedalClass = (rank: number): string => {
  if (rank === 1) return "gold"
  if (rank === 2) return "silver"
  if (rank === 3) return "bronze"
  return ""
}

const PlayerAvatar = ({ entry }: { entry: Entry }) => {
  const name = entry.user.github_username ?? `user${entry.user.id}`
  const initials = name.slice(0, 2).toUpperCase()
  if (entry.user.avatar_url === null) {
    return <span className="avatar sm">{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={name} className="avatar sm" src={entry.user.avatar_url} />
  )
}

const GRADE_LEVELS: Record<string, number> = {
  distinguished: 7,
  fellow: 8,
  intern: 1,
  junior: 2,
  mid: 3,
  principal: 6,
  senior: 4,
  staff: 5,
}

const convertGradeSlugToLevel = (slug: string): number => GRADE_LEVELS[slug] ?? 1

const GRADE_DISPLAY_NAMES: Record<string, string> = {
  distinguished: "Distinguished Engineer",
  fellow: "Fellow",
  intern: "Intern",
  junior: "Junior Developer",
  mid: "Mid Developer",
  principal: "Principal Engineer",
  senior: "Senior Engineer",
  staff: "Staff Engineer",
}

const capitalizeGradeSlug = (slug: string): string => GRADE_DISPLAY_NAMES[slug] ?? slug
