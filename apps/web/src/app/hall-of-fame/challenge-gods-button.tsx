"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { startPlaySession } from "../actions"

type Props = {
  languageId: number
}

/**
 * 殿堂入りページから直接「神々に挑戦」を開始するボタン。
 *
 * 言語選択 (/play) を経由せず、 startPlaySession Server Action でセッションを作って
 * /play/[sessionId] に直接遷移する。 LanguageSelector と同じ手順で sessionStorage に
 * 詰めてから push
 */
export function ChallengeGodsButton({ languageId }: Props) {
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
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <button
        className="btn btn-gold"
        disabled={isPending}
        onClick={handleClick}
        style={{ whiteSpace: "nowrap" }}
        type="button"
      >
        {isPending ? "準備中…" : "⚡ 神々に挑戦する"}
      </button>
      {error !== null && (
        <span className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </span>
      )}
    </div>
  )
}
