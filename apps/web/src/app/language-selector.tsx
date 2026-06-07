"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { startSoloPlaySession } from "./actions"

type Props = {
  languages: ReadonlyArray<{ id: number; name: string; slug: string }>
}

/**
 * 言語選択 + プレイ開始ボタン
 *
 * Server Action のレスポンスを sessionStorage に詰めてから /play/[sessionId] に遷移する。
 * （Server Action の戻り値は Router 遷移後に失われるため、sessionStorage で持ち越す）
 */
export function LanguageSelector({ languages }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleStart = (languageId: number, mode: "challenge_gods" | "solo") => {
    setError(null)
    startTransition(async () => {
      const result = await startSoloPlaySession(languageId, mode)
      if ("error" in result) {
        setError(result.error)
        return
      }
      sessionStorage.setItem(
        `play:${result.sessionId}`,
        JSON.stringify({
          problems: result.problems,
          repoInfo: result.repoInfo,
        }),
      )
      router.push(`/play/${result.sessionId}`)
    })
  }

  return (
    <div className="space-y-6">
      {languages.map((lang) => (
        <section
          className="rounded-lg border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          key={lang.id}
        >
          <h2 className="mb-4 text-xl font-semibold">{lang.name}</h2>
          <div className="flex gap-3">
            <button
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={isPending}
              type="button"
              onClick={() => handleStart(lang.id, "solo")}
            >
              通常プレイ
            </button>
            <button
              className="rounded border border-purple-500 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50 dark:text-purple-300"
              disabled={isPending}
              type="button"
              onClick={() => handleStart(lang.id, "challenge_gods")}
            >
              神々に挑戦
            </button>
          </div>
        </section>
      ))}

      {error && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
    </div>
  )
}
