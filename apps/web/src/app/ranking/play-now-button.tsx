"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { startPlaySession } from "../actions"

type Props = {
  className?: string
  label?: string
  languageId: number
}

/**
 * ランキング画面から直接「通常プレイ」を開始するボタン。
 *
 * 言語選択 (/play) を経由せず、 startPlaySession Server Action でセッションを作って
 * /play/[sessionId] に直接遷移する。 LanguageSelector の solo クリックと同じ手順で
 * sessionStorage に詰めてから push
 */
export function PlayNowButton({ className, label, languageId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      const result = await startPlaySession(languageId, "solo")
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
          language: result.language,
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
    <div style={{ alignItems: "center", display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <button
        className={className ?? "btn btn-primary btn-play"}
        disabled={isPending}
        onClick={handleClick}
        type="button"
      >
        {isPending ? "準備中…" : (label ?? "▶ プレイしてランクアップ")}
      </button>
      {error !== null && (
        <span className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </span>
      )}
    </div>
  )
}
