"use client"

import { useState } from "react"

import type { GetMonthlyRankingsResponse } from "@repo/api-schema"

import { MonthlyTopCard } from "./monthly-top-card"

type Language = "typescript" | "javascript"

type Props = {
  jsMonthly: GetMonthlyRankingsResponse
  tsMonthly: GetMonthlyRankingsResponse
}

const LANGUAGES: { key: Language; label: string }[] = [
  { key: "typescript", label: "TypeScript" },
  { key: "javascript", label: "JavaScript" },
]

/**
 * ホーム画面「月間トップ」カードの本体。
 * TypeScript / JavaScript をボタンで切り替える Client Component
 */
export function MonthlyTopSection({ jsMonthly, tsMonthly }: Props) {
  const [active, setActive] = useState<Language>("typescript")

  const data = active === "typescript" ? tsMonthly : jsMonthly
  const label = LANGUAGES.find((l) => l.key === active)?.label ?? ""

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
      <MonthlyTopCard data={data} language={label} />
    </div>
  )
}
