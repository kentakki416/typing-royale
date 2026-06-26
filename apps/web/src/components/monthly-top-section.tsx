"use client"

import { useState } from "react"

import type { GetMonthlyRankingsResponse, LanguageItem } from "@repo/api-schema"

import { MonthlyTopCard } from "./monthly-top-card"

export type MonthlyByLanguage = {
  language: LanguageItem
  monthly: GetMonthlyRankingsResponse
}

type Props = {
  items: MonthlyByLanguage[]
}

/**
 * ホーム画面「月間トップ」カードの本体。
 * 言語マスタ（API 取得）をボタンで切り替える Client Component。
 * カード見出し右側 (`page.tsx`) に「月間ランキング →」リンクが既にあるため、
 * ここに重複した CTA リンクは置かない
 */
export function MonthlyTopSection({ items }: Props) {
  const [activeSlug, setActiveSlug] = useState(items[0]?.language.slug ?? "")

  const active = items.find((item) => item.language.slug === activeSlug) ?? items[0]

  /**
   * 言語マスタが無い場合は何も描画しない（ホームの他コンテンツは残す）
   */
  if (active === undefined) {
    return null
  }

  return (
    <div>
      <div className="pills mb-16">
        {items.map((item) => (
          <button
            className={`pill ${activeSlug === item.language.slug ? "active" : ""}`}
            key={item.language.slug}
            style={
              activeSlug === item.language.slug
                ? { border: 0 }
                : { background: "transparent", border: 0 }
            }
            type="button"
            onClick={() => setActiveSlug(item.language.slug)}
          >
            {item.language.name}
          </button>
        ))}
      </div>
      <MonthlyTopCard data={active.monthly} />
    </div>
  )
}
