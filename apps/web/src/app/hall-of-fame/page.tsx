import type { Metadata } from "next"
import Link from "next/link"

import type { GetHallOfFameResponse } from "@repo/api-schema"

import { EmptyLanguagesState } from "@/components/empty-languages-state"
import { PageHero } from "@/components/page-hero"
import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"
import { getLanguages, resolveSelectedLanguage } from "@/libs/languages"

import { ChallengeGodsButton } from "./challenge-gods-button"
import { HofCards } from "./hof-cards"

export const metadata: Metadata = {
  title: "殿堂入り - Typing Royale",
}

/**
 * Hall of Fame 公開ページ
 *
 * - 言語タブ切替
 * - TOP 10 を全件カード形式で表示 (TOP 3 はクラウン + 金/銀/銅、4-10 は白色)
 * - 縦長になるためカード群は内部スクロール
 * - 全カードはクリックでカーテン演出 → 神モーダル
 */
export default async function HallOfFamePage({
  searchParams,
}: {
    searchParams: Promise<{ language?: string }>
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
        <Topbar active="hall-of-fame" isAuthed={accessToken !== null} />
        <div className="container">
          <PageHero icon="🏛" subtitle="言語別オールタイムトップ 10。" title="殿堂入り — 神々の殿堂" />
          <EmptyLanguagesState />
        </div>
      </>
    )
  }

  const language = selectedLanguage.slug
  const data = await apiClient.get<GetHallOfFameResponse>(
    `/api/hall-of-fame?language=${language}`,
  )

  return (
    <>
      <Topbar active="hall-of-fame" isAuthed={accessToken !== null} />

      <div className="container">
        <PageHero icon="🏛" subtitle="言語別オールタイムトップ 10。" title="殿堂入り — 神々の殿堂" />

        <div className="flex-between mb-24" style={{ alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div className="pills">
            {languages.map((lang) => (
              <Link
                className={`pill ${language === lang.slug ? "active" : ""}`}
                href={`/hall-of-fame?language=${lang.slug}`}
                key={lang.slug}
              >
                {lang.name}
              </Link>
            ))}
          </div>
          <ChallengeGodsButton languageId={selectedLanguage.id} />
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
          <HofCards entries={data.entries} languageName={selectedLanguage.name} />
        )}
      </div>
    </>
  )
}
