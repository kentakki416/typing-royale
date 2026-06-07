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
    <div className="hero" style={{ paddingTop: "120px" }}>
      <p className="text-muted text-sm" style={{ letterSpacing: "0.3em", textTransform: "uppercase" }}>
        今回のチャレンジ
      </p>
      <h1 className="mt-16">
        <span className="accent">{repoInfo.owner}</span>/{repoInfo.name}
      </h1>
      <p className="text-mono">★ {repoInfo.stars.toLocaleString()}</p>
      {repoInfo.description && (
        <p className="text-muted mt-8" style={{ maxWidth: "640px", margin: "8px auto 0" }}>
          {repoInfo.description}
        </p>
      )}
    </div>
  )
}
