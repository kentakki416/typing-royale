"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { startPlaySession } from "@/app/actions"

type Props = {
  className?: string
  label?: string
  languageId: number
}

/**
 * 言語選択 (/play) を経由せず、直接「神々に挑戦」を開始するボタン。
 *
 * 殿堂入りページ・ホーム画面から共有で使う。`startPlaySession` Server Action で
 * セッションを作って `/play/[sessionId]` に直接遷移する（LanguageSelector と同じ手順で
 * sessionStorage に詰めてから push）。label / className を渡して各画面の文言・装飾に合わせる。
 */
export function ChallengeGodsButton({
  className = "btn btn-gold",
  label = "⚡ 神々に挑戦する",
  languageId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      const result = await startPlaySession(languageId, "challenge_gods")
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
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <button
        className={className}
        disabled={isPending}
        onClick={handleClick}
        style={{ whiteSpace: "nowrap" }}
        type="button"
      >
        {isPending ? "準備中…" : label}
      </button>
      {error !== null && (
        <span className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </span>
      )}
    </div>
  )
}
