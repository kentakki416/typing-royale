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
    page?: string
}

/**
 * 1 ページの表示件数
 */
const PAGE_SIZE = 10

const EMPTY: GetCrawledReposResponse = { entries: [], language: "", total: 0 }

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
  const { language: rawLang, page: rawPage } = await searchParams
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

  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1)

  const data = await apiClient
    .get<GetCrawledReposResponse>(
      `/api/crawled-repos?language=${language}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
    )
    .catch(() => EMPTY)

  /**
   * total は本 PR で API に追加した項目。API 未デプロイ（旧レスポンスに total 無し）でも
   * 500 にしないよう、欠落時は現ページ件数でフォールバックする
   */
  const total = data.total ?? data.entries.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <Topbar active="crawled-repos" isAuthed={accessToken !== null} />

      <div className="container">
        <div className="flex-between mb-24">
          <h1>📦 クロール対象リポジトリ</h1>
          <div className="text-sm text-muted">{total.toLocaleString()} 件</div>
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

        {total === 0 ? (
          <div className="card text-center" style={{ padding: "48px 16px" }}>
            <div className="text-mono text-muted mb-16">
              まだクロール済みリポジトリがありません
            </div>
            <Link className="btn btn-primary btn-play" href="/play">▶ プレイしてみる</Link>
          </div>
        ) : (
          <>
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>リポジトリ</th>
                    <th className="numeric">★ Stars</th>
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
                      <td className="text-sm text-muted">{e.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex-between mt-16" style={{ alignItems: "center" }}>
              {page > 1 ? (
                <Link className="btn" href={`/crawled-repos?language=${language}&page=${page - 1}`}>
                  ← 前へ
                </Link>
              ) : (
                <span className="btn" style={{ opacity: 0.4, pointerEvents: "none" }}>← 前へ</span>
              )}
              <span className="text-sm text-muted">{page} / {totalPages} ページ</span>
              {page < totalPages ? (
                <Link className="btn" href={`/crawled-repos?language=${language}&page=${page + 1}`}>
                  次へ →
                </Link>
              ) : (
                <span className="btn" style={{ opacity: 0.4, pointerEvents: "none" }}>次へ →</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a> · <a href="#">ライセンス一覧</a>
      </div>
    </>
  )
}
