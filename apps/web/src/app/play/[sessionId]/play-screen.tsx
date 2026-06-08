"use client"

import { useEffect, useState } from "react"

import { FinishPlaySessionResponse, StartChallengeGodsResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { PlayLoop } from "./play-loop"
import { ResultScreen } from "./result-screen"
import { Splash } from "./splash"
import type { GhostSummary } from "./types"

type CachedStart = {
  ghostKeystrokeLogs?: StartChallengeGodsResponse["ghost_keystroke_logs"] | null
  ghostSessionId?: number | null
  ghostUserDisplay?: StartChallengeGodsResponse["ghost_user_display"] | null
  mode?: "challenge_gods" | "solo"
  problems: StartSoloPlaySessionResponse["problems"]
  repoInfo: StartSoloPlaySessionResponse["repo_info"]
}

type Phase = "loading" | "playing" | "result" | "splash"

/**
 * プレイ画面の状態切替コンポーネント
 *
 * Phase: loading → splash → playing → result
 *
 * /finish のレスポンスは PlayLoop の onFinished で渡される（result phase で
 * ResultScreen に渡す）。神々モードでは GhostSummary も同時に PlayLoop から渡る
 */
export function PlayScreen({ sessionId }: { sessionId: string }) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [start, setStart] = useState<CachedStart | null>(null)
  const [result, setResult] = useState<FinishPlaySessionResponse | null>(null)
  const [ghostSummary, setGhostSummary] = useState<GhostSummary | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(`play:${sessionId}`)
    if (!raw) {
      /**
       * sessionStorage が空 = 直リンク / リロード時 1 回目: トップに戻す
       */
      window.location.href = "/"
      return
    }
    /**
     * マウント時 1 回のみ sessionStorage から復元する初期化処理
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStart(JSON.parse(raw) as CachedStart)

    setPhase("splash")
  }, [sessionId])

  if (phase === "loading" || start === null) {
    return <div className="container container-narrow" style={{ paddingTop: "120px", textAlign: "center" }}>読み込み中...</div>
  }

  if (phase === "splash") {
    return <Splash repoInfo={start.repoInfo} onFinished={() => setPhase("playing")} />
  }

  if (phase === "playing") {
    return (
      <PlayLoop
        ghostKeystrokeLogs={start.ghostKeystrokeLogs ?? null}
        ghostUserDisplay={start.ghostUserDisplay ?? null}
        mode={start.mode ?? "solo"}
        problems={start.problems}
        sessionId={sessionId}
        onFinished={(r, summary) => {
          setResult(r)
          setGhostSummary(summary)
          setPhase("result")
        }}
      />
    )
  }

  return (
    <ResultScreen
      ghostSummary={ghostSummary}
      ghostUserDisplay={start.ghostUserDisplay ?? null}
      mode={start.mode ?? "solo"}
      problems={start.problems}
      repoInfo={start.repoInfo}
      result={result}
    />
  )
}
