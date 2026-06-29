"use client"

import { useRouter } from "next/navigation"
import React, { useState, useTransition } from "react"

import { startPlaySession } from "./actions"

type Lang = {
  /** 問題プール未整備等で「近日公開」扱いにし、ボタンを押せなくする場合 true */
  comingSoon: boolean
  iconClass: string
  iconText: string
  id: number
  name: string
}

type Props = {
  languages: ReadonlyArray<Lang>
}

/**
 * 1 行あたりの列数を決める。
 * - 3 以下はその数だけ横に並べる（3 → 3 列）
 * - 4 は 2 列（2 × 2 で揃える）
 * - 5 以上は 3 列（5 → 3+2 / 6 → 3+3）
 */
const columnsFor = (count: number): number => {
  if (count === 4) return 2
  return Math.min(3, Math.max(1, count))
}

const CARD_WIDTH = 300
const GAP = 20

/**
 * 言語選択グリッド + プレイ開始ボタン
 *
 * カードを列数固定の grid で並べる（横スクロール・折り返しは廃止）。列数は
 * {@link columnsFor} で決め、`--lang-cols` で CSS に渡して 1 行あたりの枚数を固定する
 * （3 言語は横一列 / 4 言語は 2×2）。グリッド幅は「列数 × カード幅」を上限に
 * `min(96vw, …)` で full-bleed させて narrow コンテナを左右対称に突き破る。
 * Server Action の結果は sessionStorage に詰めてから /play/[sessionId] に遷移する
 * （Server Action の戻り値は Router 遷移後に失われるため）。
 */
export function LanguageSelector({ languages }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const cols = columnsFor(languages.length)
  const gridMax = cols * CARD_WIDTH + (cols - 1) * GAP

  const handleStart = (languageId: number, mode: "challenge_gods" | "solo") => {
    setError(null)
    startTransition(async () => {
      const result = await startPlaySession(languageId, mode)
      if ("error" in result) {
        setError(result.error)
        return
      }
      sessionStorage.setItem(
        `play:${result.sessionId}`,
        JSON.stringify({
          ghostKeystrokeLogs: result.ghostKeystrokeLogs,
          ghostSessionId: result.ghostSessionId,
          ghostUserDisplay: result.ghostUserDisplay,
          isGuest: result.isGuest,
          mode: result.mode,
          problemIds: result.problemIds,
          problems: result.problems,
          repoInfo: result.repoInfo,
        }),
      )
      router.push(`/play/${result.sessionId}`)
    })
  }

  return (
    <>
      <div
        className="lang-grid"
        style={{ "--lang-cols": cols, "--lang-grid-max": `${gridMax}px` } as React.CSSProperties}
      >
        {languages.map((lang) => (
          <div
            aria-disabled={lang.comingSoon ? true : undefined}
            className="lang-card"
            key={lang.id}
            style={lang.comingSoon
              ? { cursor: "not-allowed", filter: "grayscale(0.8)", opacity: 0.55 }
              : undefined}
          >
            <div className={`lang-icon ${lang.iconClass}`}>{lang.iconText}</div>
            <h3>{lang.name}</h3>
            {lang.comingSoon && (
              <div className="text-xs text-muted text-center" style={{ marginTop: "4px" }}>
                近日公開
              </div>
            )}

            <div className="mt-16" style={{ display: "grid", gap: "8px" }}>
              <button
                className="btn btn-primary btn-play btn-block"
                disabled={isPending || lang.comingSoon}
                type="button"
                onClick={() => handleStart(lang.id, "solo")}
              >
                ▶ 通常プレイ
              </button>
              <button
                className="btn btn-gold btn-block"
                disabled={isPending || lang.comingSoon}
                type="button"
                onClick={() => handleStart(lang.id, "challenge_gods")}
              >
                ⚡ 神々に挑戦
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-16" style={{ color: "var(--error)", textAlign: "center" }}>
          {error}
        </p>
      )}
    </>
  )
}
