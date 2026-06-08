import type { Metadata } from "next"
import Link from "next/link"

import type { GetHallOfFameResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"

export const metadata: Metadata = {
  title: "Hall of Fame - Typing Royale",
}

const SUPPORTED_LANGUAGES = ["typescript", "javascript"] as const
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
}

/**
 * Hall of Fame 公開ページ
 *
 * 言語別 TOP 10 + 各エントリのコメントを表示。score-ranking の `/ranking` と同じく
 * 言語タブ は ?language=... query で永続化、Next.js Link で再フェッチ
 */
export default async function HallOfFamePage({
  searchParams,
}: {
    searchParams: Promise<{ language?: string }>
}) {
  const { language: rawLang } = await searchParams
  const language: SupportedLanguage = SUPPORTED_LANGUAGES.includes(rawLang as SupportedLanguage)
    ? (rawLang as SupportedLanguage)
    : "typescript"

  const data = await apiClient.get<GetHallOfFameResponse>(`/api/hall-of-fame?language=${language}`)

  return (
    <>
      <Topbar active="hall-of-fame" />

      <div className="container">
        <div className="flex-between mb-24">
          <h1>🏛 Hall of Fame</h1>
          <div className="text-sm text-muted">入賞者のコメントを掲載</div>
        </div>

        <div className="flex-between mb-16">
          <div className="pills">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <Link
                className={`pill ${language === lang ? "active" : ""}`}
                href={`/hall-of-fame?language=${lang}`}
                key={lang}
              >
                {LANGUAGE_LABELS[lang]}
              </Link>
            ))}
          </div>
          <Link className="text-sm" href="/ranking">ランキング全体 →</Link>
        </div>

        {data.entries.length === 0 ? (
          <div className="card text-center" style={{ padding: "48px 16px" }}>
            <div className="text-mono text-muted mb-16">
              まだ Hall of Fame エントリがありません
            </div>
            <Link className="btn btn-primary btn-play" href="/play">
              ▶ 最初のプレイヤーになる
            </Link>
          </div>
        ) : (
          <div className="card mb-16">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "48px" }}>順位</th>
                  <th>プレイヤー</th>
                  <th className="numeric">ベスト</th>
                  <th>コメント</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.best_play_session_id}>
                    <td>
                      <span className={`rank-badge ${convertRankToMedalClass(e.rank)}`}>#{e.rank}</span>
                    </td>
                    <td>
                      <div className="player-cell">
                        <PlayerAvatar avatarUrl={e.user.avatar_url} displayName={e.user.display_name} />
                        <Link href={`/players/${e.user.id}`}>
                          <strong>@{e.user.display_name}</strong>
                        </Link>
                      </div>
                    </td>
                    <td className="numeric"><strong>{e.score.toLocaleString()}</strong></td>
                    <td>
                      {e.comment === null ? (
                        <span className="text-muted text-sm">（コメントなし）</span>
                      ) : (
                        <span>{e.comment}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="footer">
        <Link href="/">トップに戻る</Link>
      </div>
    </>
  )
}

const convertRankToMedalClass = (rank: number): string => {
  if (rank === 1) return "gold"
  if (rank === 2) return "silver"
  if (rank === 3) return "bronze"
  return ""
}

const PlayerAvatar = ({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) => {
  const initials = displayName.slice(0, 2).toUpperCase()
  if (avatarUrl === null) {
    return <span className="avatar sm">{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={displayName} className="avatar sm" src={avatarUrl} />
  )
}
