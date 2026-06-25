"use client"

import { useEffect } from "react"

import { StartChallengeGodsResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

type Props = {
  /**
   * 神々モードのみ：挑戦相手の神。null なら通常モード（出典表示なし）
   */
  ghostUserDisplay: StartChallengeGodsResponse["ghost_user_display"] | null
  onFinished: () => void
  repoInfo: StartSoloPlaySessionResponse["repo_info"]
}

const SPLASH_DURATION_MS = 2000

/** 神の名前を強調する金色グロー */
const GOLD_GLOW = "0 0 12px rgba(255, 213, 74, 0.85), 0 0 28px rgba(255, 200, 61, 0.55)"

/**
 * 「今回のチャレンジ」を 2 秒間表示するスプラッシュ。
 * 神々モードでは「誰の・いつの記録に挑戦するか」を主役（上）に、出題リポジトリを下に出す。
 * 通常モードは出題リポジトリを主役に出す。
 */
export function Splash({ ghostUserDisplay, onFinished, repoInfo }: Props) {
  useEffect(() => {
    const timer = setTimeout(onFinished, SPLASH_DURATION_MS)
    return () => clearTimeout(timer)
  }, [onFinished])

  const ghostPlayedAtLabel = ghostUserDisplay !== null
    ? new Date(ghostUserDisplay.played_at).toLocaleDateString("ja-JP", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Tokyo",
      year: "numeric",
    })
    : null

  return (
    <div className="hero" style={{ paddingTop: "120px" }}>
      <p className="text-muted text-sm" style={{ letterSpacing: "0.3em", textTransform: "uppercase" }}>
        今回のチャレンジ
      </p>

      {/* 神々モード：誰の・いつの記録に挑戦するかを主役（上）に出す */}
      {ghostUserDisplay !== null && (
        <>
          <h1 className="mt-16" style={{ fontSize: "40px", lineHeight: 1.3 }}>
            ⚡{" "}
            <span style={{ color: "var(--gold)", textShadow: GOLD_GLOW }}>
              @{ghostUserDisplay.github_username ?? "anonymous"}
            </span>
            {" の "}
            <span style={{ color: "var(--gold-light)" }}>{ghostPlayedAtLabel}</span>
            {" の記録に挑戦"}
          </h1>
          <p
            className="text-muted text-sm mt-24"
            style={{ letterSpacing: "0.3em", textTransform: "uppercase" }}
          >
            対象のリポジトリ
          </p>
        </>
      )}

      <h1 className="mt-16">
        <span className="accent">{repoInfo.owner}</span>/{repoInfo.name}
      </h1>
      <p className="text-mono mt-8">★ {repoInfo.stars.toLocaleString()}</p>
      {repoInfo.description && (
        <p className="text-muted mt-8" style={{ maxWidth: "640px", margin: "8px auto 0" }}>
          {repoInfo.description}
        </p>
      )}
    </div>
  )
}
