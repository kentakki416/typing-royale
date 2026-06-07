"use client"

import { useEffect } from "react"

import { StartSoloPlaySessionResponse } from "@repo/api-schema"

type Props = {
  onFinished: () => void
  repoInfo: StartSoloPlaySessionResponse["repo_info"]
}

const SPLASH_DURATION_MS = 2000

/**
 * 「今回のチャレンジ：{owner}/{name}」を 2 秒間表示するスプラッシュ
 */
export function Splash({ onFinished, repoInfo }: Props) {
  useEffect(() => {
    const timer = setTimeout(onFinished, SPLASH_DURATION_MS)
    return () => clearTimeout(timer)
  }, [onFinished])

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-900 px-6 text-zinc-50">
      <div className="w-full max-w-xl space-y-4 text-center">
        <p className="text-sm uppercase tracking-widest text-zinc-400">今回のチャレンジ</p>
        <h1 className="text-4xl font-bold">
          {repoInfo.owner}/{repoInfo.name}
        </h1>
        <p className="text-sm text-zinc-300">★ {repoInfo.stars.toLocaleString()}</p>
        {repoInfo.description && (
          <p className="line-clamp-3 text-base text-zinc-200">{repoInfo.description}</p>
        )}
      </div>
    </main>
  )
}
