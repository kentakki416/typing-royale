import Link from "next/link"

import type { GetMonthlyRankingsResponse } from "@repo/api-schema"

type Entry = GetMonthlyRankingsResponse["entries"][number]

type Props = {
    entries: Entry[]
}

/**
 * 言語別「今月の」ランキングテーブル (TOP 10)。
 *
 * 月間スナップショット (`monthly_ranking_snapshots`) に保存されているフィールド
 * (rank / user / score / accuracy / played_at) のみを表示する。
 * `best_play_session_id` や `typed_chars` は snapshot に含まれないため、
 * 「文字数」列やリプレイ「視聴」リンクは出さない（リプレイは殿堂入り `/hall-of-fame`
 * 側に集約する設計）。
 *
 * 「自分の行ハイライト」は user_id を取り出す経路が web 側にまだ無いため、
 * 後続 PR で `/api/rankings/monthly/me` を追加するときにまとめて対応する
 */
export function RankingTable({ entries }: Props) {
  if (entries.length === 0) return null

  return (
    <div className="card mb-16">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: "48px" }}>順位</th>
            <th>プレイヤー</th>
            <th>グレード</th>
            <th className="numeric">スコア</th>
            <th className="numeric">正確率</th>
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
                  <Link href={`/players/${e.user.id}`}>
                    <strong>@{e.user.github_username ?? `user${e.user.id}`}</strong>
                  </Link>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
