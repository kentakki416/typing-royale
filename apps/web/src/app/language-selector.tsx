"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

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
 * 言語選択カード + プレイ開始ボタン
 *
 * Server Action の結果を sessionStorage に詰めてから /play/[sessionId] に遷移
 * （Server Action の戻り値は Router 遷移後に失われるため）
 */
export function LanguageSelector({ languages }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
      <div className="lang-grid">
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

            <div className="flex gap-8 mt-16" style={{ justifyContent: "center" }}>
              <button
                className="btn btn-primary btn-play"
                disabled={isPending || lang.comingSoon}
                type="button"
                onClick={() => handleStart(lang.id, "solo")}
              >
                ▶ 通常プレイ
              </button>
              <button
                className="btn btn-gold"
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
