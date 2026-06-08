import Link from "next/link"

import type { GetRankingsResponse } from "@repo/api-schema"

type Entry = GetRankingsResponse["entries"][number]

type Props = {
    entries: Entry[]
    /**
     * 自分のベストプレイ ID（自分の行をハイライトするために `entries[].best_play_session_id`
     * と一致するものを `.me` にする）。未ログイン / ベスト未保存 / 圏外なら null
     */
    meBestPlaySessionId: number | null
}

/**
 * 言語別 TOP N のランキングテーブル
 * デザイン: docs/mocks/ranking.html の .table 構造を踏襲
 */
export function RankingTable({ entries, meBestPlaySessionId }: Props) {
  if (entries.length === 0) return null

  return (
    <div className="card mb-16">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: "48px" }}>順位</th>
            <th>プレイヤー</th>
            <th>グレード</th>
            <th className="numeric">ベスト</th>
            <th className="numeric">文字数</th>
            <th className="numeric">正確率</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr className={meBestPlaySessionId === e.best_play_session_id ? "me" : ""} key={e.best_play_session_id}>
              <td>
                <span className={`rank-badge ${convertRankToMedalClass(e.rank)}`}>#{e.rank}</span>
              </td>
              <td>
                <div className="player-cell">
                  <PlayerAvatar entry={e} />
                  <Link href={`/players/${e.user.id}`}>
                    <strong>@{e.user.display_name}</strong>
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
              <td className="numeric">{e.typed_chars.toLocaleString()}</td>
              <td className="numeric">{(e.accuracy * 100).toFixed(1)}%</td>
              <td>
                <Link
                  className="badge accent"
                  href={`/replay/${e.best_play_session_id}`}
                  title="リプレイを見る"
                >
                  ▶ 視聴
                </Link>
              </td>
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
  const initials = entry.user.display_name.slice(0, 2).toUpperCase()
  if (entry.user.avatar_url === null) {
    return <span className="avatar sm">{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={entry.user.display_name} className="avatar sm" src={entry.user.avatar_url} />
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
