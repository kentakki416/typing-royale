import type { Metadata } from "next"
import Link from "next/link"

import type { GetHallOfFameResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"

import { HofCards } from "./hof-cards"

export const metadata: Metadata = {
  title: "殿堂入り - Typing Royale",
}

const SUPPORTED_LANGUAGES = ["typescript", "javascript"] as const
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
}

/**
 * Hall of Fame 公開ページ（mock: hall-of-fame.html 準拠）
 *
 * - 言語タブ切替
 * - 上位 3 名はクラウン付き hof-card、クリックでカーテン演出 → 神モーダル
 * - 4 位以下はテーブル形式でコメント + リプレイリンク表示
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

  const [data, accessToken] = await Promise.all([
    apiClient.get<GetHallOfFameResponse>(`/api/hall-of-fame?language=${language}`),
    getAccessToken(),
  ])

  const topThree = data.entries.filter((e) => e.rank <= 3)
  const rest = data.entries.filter((e) => e.rank > 3)

  return (
    <>
      <Topbar active="hall-of-fame" isAuthed={accessToken !== null} />

      <div className="container">
        <div className="text-center mb-24">
          <div style={{ fontSize: "56px" }}>🏛</div>
          <h1>殿堂入り — 神々の殿堂</h1>
          <p className="text-muted">言語別オールタイムトップ 10。上位 3 名は神々の称号付き。</p>
        </div>

        <div className="text-center mb-24">
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
        </div>

        {data.entries.length === 0 ? (
          <div className="card text-center" style={{ padding: "48px 16px" }}>
            <div className="text-mono text-muted mb-16">
              まだ殿堂入りエントリがありません
            </div>
            <Link className="btn btn-primary btn-play" href="/play">
              ▶ 最初のプレイヤーになる
            </Link>
          </div>
        ) : (
          <>
            {topThree.length > 0 && <HofCards entries={topThree} />}

            {rest.length > 0 && (
              <div className="card mt-24">
                <div className="card-header">
                  <div className="card-title">4 位以下</div>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: "48px" }}>順位</th>
                      <th>プレイヤー</th>
                      <th className="numeric">ベスト</th>
                      <th>コメント</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((e) => (
                      <tr key={e.best_play_session_id}>
                        <td>
                          <span className="rank-badge">#{e.rank}</span>
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
                        <td>
                          <Link
                            className="badge accent"
                            href={`/replay/${e.best_play_session_id}`}
                            title="リプレイを見る"
                          >
                            ▶ リプレイ
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="footer">
        <Link href="/">トップに戻る</Link>
      </div>
    </>
  )
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
