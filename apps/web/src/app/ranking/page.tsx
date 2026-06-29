import type { Metadata } from "next"
import Link from "next/link"

import type { GetMonthlyRankingsResponse, GetMyRankingResponse } from "@repo/api-schema"

import { EmptyLanguagesState } from "@/components/empty-languages-state"
import { MyRankingSidebar } from "@/components/my-ranking-sidebar"
import { PageHero } from "@/components/page-hero"
import { RankingTable } from "@/components/ranking-table"
import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"
import { getLanguages, resolveSelectedLanguage } from "@/libs/languages"

import { PlayNowButton } from "./play-now-button"

export const metadata: Metadata = {
  title: "今月のランキング - Typing Royale",
}

type Search = {
    language?: string
}

/**
 * /ranking 画面 (月間ランキング)
 *
 * 言語別の **今月のランキング** TOP 10 を表示する。データソースは
 * `monthly_ranking_snapshots`（/finish 同期 UPSERT、リアルタイム反映）。
 *
 * 全期間 TOP 10 は `/hall-of-fame` 側に集約する設計のため、本ページからは
 * リプレイ「視聴」リンクや「文字数」など hall-of-fame と被る情報を出さない。
 * サイドバーの「あなたの状況」は全期間ベース（グレード進捗を見せるため）で、
 * 月間版の自分順位は後続 PR で追加予定
 */
export default async function RankingPage({
  searchParams,
}: {
    searchParams: Promise<Search>
}) {
  const { language: rawLang } = await searchParams
  const languages = await getLanguages()
  const accessToken = await getAccessToken()

  const selectedSlug = resolveSelectedLanguage(languages, rawLang)
  const selectedLanguage = languages.find((lang) => lang.slug === selectedSlug)

  /**
   * 言語マスタが無い場合の空状態（本来 migration で投入されるため発生しない）
   */
  if (selectedLanguage === undefined) {
    return (
      <>
        <Topbar active="ranking" isAuthed={accessToken !== null} />
        <div className="container">
          <PageHero icon="🏆" subtitle="言語別の今月のスコア・月初にリセット" title="今月のランキング" />
          <EmptyLanguagesState />
        </div>
      </>
    )
  }

  const language = selectedLanguage.slug

  const [monthly, me] = await Promise.all([
    apiClient.get<GetMonthlyRankingsResponse>(
      `/api/rankings/monthly?language=${language}&limit=10`,
    ),
    accessToken === null
      ? Promise.resolve(null)
      : apiClient
        .get<GetMyRankingResponse>(`/api/rankings/me?language=${language}`)
        .catch(() => null),
  ])

  /**
   * "YYYY-MM" を「YYYY 年 M 月」に整形して見出しに使う
   */
  const monthLabel = formatYearMonthLabel(monthly.year_month)

  return (
    <>
      <Topbar active="ranking" isAuthed={accessToken !== null} />

      <div className="container">
        <PageHero
          icon="🏆"
          subtitle={`${monthLabel} のスコア・月初にリセット`}
          title="今月のランキング"
        />

        <div className="flex-between mb-16">
          <div className="pills">
            {languages.map((lang) => (
              <Link
                className={`pill ${language === lang.slug ? "active" : ""}`}
                href={`/ranking?language=${lang.slug}`}
                key={lang.slug}
              >
                {lang.name}
              </Link>
            ))}
          </div>
          <div className="text-sm text-muted">
            全期間 TOP 10 は <Link href="/hall-of-fame">殿堂入り</Link> へ
          </div>
        </div>

        <div className="row">
          <div className="col">
            <RankingTable
              entries={monthly.entries}
              languageName={selectedLanguage.name}
              languageSlug={language}
            />

            {monthly.entries.length === 0 && (
              <div className="card text-center mt-16" style={{ padding: "48px 16px" }}>
                <div className="text-mono text-muted mb-16">
                  {monthLabel} はまだランキングがありません
                </div>
                <PlayNowButton
                  label="▶ 最初のプレイヤーになる"
                  languageId={selectedLanguage.id}
                />
              </div>
            )}

            <div className="text-center mt-16">
              <PlayNowButton
                className="btn btn-primary btn-play btn-large"
                languageId={selectedLanguage.id}
              />
            </div>
          </div>

          <aside className="col-sidebar">
            <MyRankingSidebar
              languageLabel={selectedLanguage.name}
              me={me}
              totalPlayers={me?.total_ranked_players ?? 0}
            />

            <div className="card mb-16" style={{ borderColor: "rgba(210, 153, 34, 0.3)" }}>
              <div className="card-header">
                <div className="card-title">⚠ 月間ランキングの仕様</div>
              </div>
              <ul
                className="text-sm text-muted"
                style={{ display: "grid", gap: "6px", paddingLeft: "18px" }}
              >
                <li>{monthLabel} のスコアのみ集計（JST 暦月）</li>
                <li>月初 00:00 (JST) に次の年月へ切り替わる</li>
                <li>1 プレイヤーにつき月内ベスト 1 件をランキング</li>
                <li>プレイ完了と同時にリアルタイム反映</li>
                <li>上位 10 名のみ保持（圏外スコアは保存されない）</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

/**
 * "2026-06" → "2026 年 6 月" に整形。空文字は「今月」を返す
 */
const formatYearMonthLabel = (ym: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(ym)
  if (match === null) return "今月"
  const year = match[1]
  const month = Number(match[2])
  return `${year} 年 ${month} 月`
}
