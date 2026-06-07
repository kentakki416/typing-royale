"use client"

import { useEffect, useState } from "react"

import { StartSoloPlaySessionResponse } from "@repo/api-schema"

import { PlayLoop } from "./play-loop"
import { Splash } from "./splash"

type CachedStart = {
  problems: StartSoloPlaySessionResponse["problems"]
  repoInfo: StartSoloPlaySessionResponse["repo_info"]
}

type Phase = "loading" | "playing" | "result" | "splash"

/**
 * プレイ画面の状態切替コンポーネント
 *
 * Phase: loading → splash → playing → result
 *
 * splash と problems の出題シーケンスは sessionStorage 経由で言語選択画面から
 * 引き継ぐ（Server Action の戻り値は Router 遷移で失われるため）
 *
 * step5 で result UI を実装するが、本 step では placeholder
 */
export function PlayScreen({ sessionId }: { sessionId: string }) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [start, setStart] = useState<CachedStart | null>(null)

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("splash")
  }, [sessionId])

  if (phase === "loading" || start === null) {
    return <div className="p-10 text-center text-sm text-gray-500">読み込み中...</div>
  }

  if (phase === "splash") {
    return <Splash repoInfo={start.repoInfo} onFinished={() => setPhase("playing")} />
  }

  if (phase === "playing") {
    return (
      <PlayLoop
        problems={start.problems}
        sessionId={sessionId}
        onFinished={() => setPhase("result")}
      />
    )
  }

  /**
   * step5 で実装。本 step では placeholder
   */
  return (
    <div className="container container-narrow" style={{ paddingTop: "120px", textAlign: "center" }}>
      <h1>リザルト画面</h1>
      <p className="text-muted">step5 で本実装します</p>
    </div>
  )
}
