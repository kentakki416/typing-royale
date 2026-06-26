import type { Metadata } from "next"
import Link from "next/link"

import type { GetCrawledReposResponse } from "@repo/api-schema"

import { EmptyLanguagesState } from "@/components/empty-languages-state"
import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"
import { getLanguages, resolveSelectedLanguage } from "@/libs/languages"

export const metadata: Metadata = {
  title: "クロール対象リポジトリ - Typing Royale",
}

type Search = {
    language?: string
}

const EMPTY: GetCrawledReposResponse = { entries: [], language: "" }

/**
 * /crawled-repos 画面
 *
 * 出題に使われている GitHub リポジトリの全件一覧。stars 降順で表示。
 * 言語タブは ?language=... query で永続化
 */
export default async function CrawledReposPage({
  searchParams,
}: {
    searchParams: Promise<Search>
}) {
  const { language: rawLang } = await searchParams
  const languages = await getLanguages()
  const accessToken = await getAccessToken()

  const language = resolveSelectedLanguage(languages, rawLang)

  /**
   * 言語マスタが無い場合の空状態（本来 migration で投入されるため発生しない）
   */
  if (language === null) {
    return (
      <>
        <Topbar active="crawled-repos" isAuthed={accessToken !== null} />
        <div className="container">
          <h1 className="mb-24">📦 クロール対象リポジトリ</h1>
          <EmptyLanguagesState />
        </div>
      </>
    )
  }

  const data = await apiClient
    .get<GetCrawledReposResponse>(`/api/crawled-repos?language=${language}&limit=1000`)
    .catch(() => EMPTY)

  return (
    <>
      <Topbar active="crawled-repos" isAuthed={accessToken !== null} />

      <div className="container">
        <div className="flex-between mb-24">
          <h1>📦 クロール対象リポジトリ</h1>
          <div className="text-sm text-muted">{data.entries.length.toLocaleString()} 件</div>
        </div>

        <div className="mb-16">
          <div className="pills">
            {languages.map((lang) => (
              <Link
                className={`pill ${language === lang.slug ? "active" : ""}`}
                href={`/crawled-repos?language=${lang.slug}`}
                key={lang.slug}
              >
                {lang.name}
              </Link>
            ))}
          </div>
        </div>

        {data.entries.length === 0 ? (
          <div className="card text-center" style={{ padding: "48px 16px" }}>
            <div className="text-mono text-muted mb-16">
              まだクロール済みリポジトリがありません
            </div>
            <Link className="btn btn-primary btn-play" href="/play">▶ プレイしてみる</Link>
          </div>
        ) : (
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>リポジトリ</th>
                  <th className="numeric">★ Stars</th>
                  <th className="numeric">出題数</th>
                  <th>説明</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.full_name}>
                    <td>
                      <a
                        href={`https://github.com/${e.full_name}`}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        {e.full_name}
                      </a>
                    </td>
                    <td className="numeric">{e.stars.toLocaleString()}</td>
                    <td className="numeric">{e.stored_count.toLocaleString()}</td>
                    <td className="text-sm text-muted">{e.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a> · <a href="#">ライセンス一覧</a>
      </div>
    </>
  )
}
