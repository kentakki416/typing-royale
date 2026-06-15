import type { Metadata } from "next"
import Link from "next/link"

import type { GetMyRankingResponse, GetRankingsResponse } from "@repo/api-schema"

import { MyRankingSidebar } from "@/components/my-ranking-sidebar"
import { RankingTable } from "@/components/ranking-table"
import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"

export const metadata: Metadata = {
  title: "ランキング - Typing Royale",
}

type Search = {
    language?: string
}

const SUPPORTED_LANGUAGES = ["typescript", "javascript"] as const

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
}

/**
 * /ranking 画面
 *
 * 言語別 TOP 10 + サイドバーで自分の状況。Server Component が
 * rankings (公開) と me (ログイン時のみ) を並列 fetch して SSR する。
 * 言語タブは ?language=... query で永続化（Next.js Link で同一ページ再フェッチ）。
 */
export default async function RankingPage({
  searchParams,
}: {
    searchParams: Promise<Search>
}) {
  const { language: rawLang } = await searchParams
  const language: SupportedLanguage = SUPPORTED_LANGUAGES.includes(rawLang as SupportedLanguage)
    ? (rawLang as SupportedLanguage)
    : "typescript"

  const accessToken = await getAccessToken()

  const [rankings, me] = await Promise.all([
    apiClient.get<GetRankingsResponse>(`/api/rankings?language=${language}`),
    accessToken === null
      ? Promise.resolve(null)
      : apiClient
        .get<GetMyRankingResponse>(`/api/rankings/me?language=${language}`)
        .catch(() => null),
  ])

  return (
    <>
      <Topbar active="ranking" isAuthed={accessToken !== null} />

      <div className="container">
        <div className="flex-between mb-24">
          <h1>🏆 全期間ランキング</h1>
          <div className="text-sm text-muted">現在の順位を即時表示</div>
        </div>

        <div className="flex-between mb-16">
          <div className="pills">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <Link
                className={`pill ${language === lang ? "active" : ""}`}
                href={`/ranking?language=${lang}`}
                key={lang}
              >
                {LANGUAGE_LABELS[lang]}
              </Link>
            ))}
          </div>
          <div className="text-sm text-muted">
            {rankings.total_ranked_players.toLocaleString()} 人がランキング対象
          </div>
        </div>

        <div className="row">
          <div className="col">
            <RankingTable
              entries={rankings.entries}
              meBestPlaySessionId={me?.best_play_session_id ?? null}
            />

            {rankings.entries.length === 0 && (
              <div className="card text-center mt-16" style={{ padding: "48px 16px" }}>
                <div className="text-mono text-muted mb-16">
                  まだランキングがありません
                </div>
                <Link className="btn btn-primary btn-play" href="/play">
                  ▶ 最初のプレイヤーになる
                </Link>
              </div>
            )}

            <div className="text-center mt-16">
              <Link className="btn btn-primary btn-play btn-large" href="/play">
                ▶ プレイしてランクアップ
              </Link>
            </div>
          </div>

          <aside className="col-sidebar">
            <MyRankingSidebar
              language={language}
              me={me}
              totalPlayers={rankings.total_ranked_players}
            />

            <div className="card mb-16" style={{ borderColor: "rgba(210, 153, 34, 0.3)" }}>
              <div className="card-header">
                <div className="card-title">⚠ ランキングの仕様</div>
              </div>
              <ul
                className="text-sm text-muted"
                style={{ display: "grid", gap: "6px", paddingLeft: "18px" }}
              >
                <li>全期間（オールタイム）のみ集計</li>
                <li>1 プレイヤーにつきベスト 1 件をランキング</li>
                <li>同点時は正確率 → 達成日時の順で決定</li>
                <li>順位はリアルタイムで更新（バッチ集計なし）</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>

      <div className="footer">
        <Link href="/">トップに戻る</Link>
      </div>
    </>
  )
}
