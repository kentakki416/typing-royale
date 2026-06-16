"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { GetCrawledReposResponse } from "@repo/api-schema"

type Language = "typescript" | "javascript"

const LANGUAGES: { key: Language; label: string }[] = [
  { key: "typescript", label: "TypeScript" },
  { key: "javascript", label: "JavaScript" },
]

/**
 * ホーム画面サイドバーの「クロール対象リポジトリ」セクション。
 * 言語タブで切替、各タブで stars 上位 5 件を表示。「全件 →」リンクで /crawled-repos
 * 詳細ページに遷移する
 */
export function CrawledReposSection() {
  const [active, setActive] = useState<Language>("typescript")
  const [data, setData] = useState<Record<Language, GetCrawledReposResponse | null>>({
    javascript: null,
    typescript: null,
  })

  useEffect(() => {
    if (data[active] !== null) return
    const load = async () => {
      try {
        const res = await fetch(`/api/internal/crawled-repos?language=${active}&limit=5`)
        if (!res.ok) return
        const json = await res.json() as GetCrawledReposResponse
        setData((prev) => ({ ...prev, [active]: json }))
      } catch {
        /** 補助情報なのでサイレント */
      }
    }
    void load()
  }, [active, data])

  const current = data[active]

  return (
    <div>
      <div className="pills mb-16">
        {LANGUAGES.map((lang) => (
          <button
            className={`pill ${active === lang.key ? "active" : ""}`}
            key={lang.key}
            style={active === lang.key ? { border: 0 } : { background: "transparent", border: 0 }}
            type="button"
            onClick={() => setActive(lang.key)}
          >
            {lang.label}
          </button>
        ))}
      </div>

      {current === null ? (
        <div className="text-sm text-muted text-center" style={{ padding: "16px 0" }}>
          読み込み中…
        </div>
      ) : current.entries.length === 0 ? (
        <div className="text-sm text-muted text-center" style={{ padding: "16px 0" }}>
          まだクロール済みリポジトリがありません
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {current.entries.map((e) => (
            <li
              key={e.full_name}
              style={{
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                padding: "8px 0",
              }}
            >
              <a
                className="text-sm"
                href={`https://github.com/${e.full_name}`}
                rel="noreferrer noopener"
                target="_blank"
                style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {e.full_name}
              </a>
              <div className="text-xs text-muted">★ {e.stars.toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="text-sm mt-16" style={{ textAlign: "right" }}>
        <Link href={`/crawled-repos?language=${active}`}>全件 →</Link>
      </div>
    </div>
  )
}
