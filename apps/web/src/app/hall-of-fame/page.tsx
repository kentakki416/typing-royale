import type { Metadata } from "next"
import Link from "next/link"

import type { GetHallOfFameResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"

import { ChallengeGodsButton } from "./challenge-gods-button"
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
 * 言語 slug → DB の Language.id マップ。 packages/db/prisma/seed.ts と
 * apps/web/src/app/play/page.tsx の `SUPPORTED_LANGUAGES` と整合させる
 */
const LANGUAGE_IDS: Record<SupportedLanguage, number> = {
  javascript: 2,
  typescript: 1,
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
  const language: SupportedLanguage = SUPPORTED_LANGUAGES.includes(rawLang as SupportedLanguage)
    ? (rawLang as SupportedLanguage)
    : "typescript"

  const [data, accessToken] = await Promise.all([
    apiClient.get<GetHallOfFameResponse>(`/api/hall-of-fame?language=${language}`),
    getAccessToken(),
  ])

  return (
    <>
      <Topbar active="hall-of-fame" isAuthed={accessToken !== null} />

      <div className="container">
        <div className="text-center mb-24">
          <div style={{ fontSize: "56px" }}>🏛</div>
          <h1>殿堂入り — 神々の殿堂</h1>
          <p className="text-muted">言語別オールタイムトップ 10。</p>
        </div>

        <div className="flex-between mb-24" style={{ alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
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
          <ChallengeGodsButton languageId={LANGUAGE_IDS[language]} />
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
          <HofCards entries={data.entries} />
        )}
      </div>

      <div className="footer">
        <Link href="/">トップに戻る</Link>
      </div>
    </>
  )
}
