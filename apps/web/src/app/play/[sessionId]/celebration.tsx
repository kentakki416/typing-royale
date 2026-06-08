"use client"

import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react"
import { useEffect, useRef, useState } from "react"

type Props = {
  /**
   * Lottie 再生完了 or タイムアウト到達でリザルト遷移
   */
  onFinished: () => void
}

/**
 * リザルト直前の祝福アニメーション
 *
 * /public/celebration.lottie をフルスクリーン暗背景で再生する。
 * 再生が onComplete を出さないケース (loop 動画 / 失敗) に備えて
 * MAX_DURATION_MS を経過したら強制的に onFinished を呼ぶ
 */
const MAX_DURATION_MS = 4500

export function Celebration({ onFinished }: Props) {
  const [finished, setFinished] = useState(false)
  const onFinishedRef = useRef(onFinished)

  /**
   * onFinished の最新値を ref に反映 (render 中でなく effect 内で)
   */
  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  const handleFinish = () => {
    if (finished) return
    setFinished(true)
    onFinishedRef.current()
  }

  /**
   * fallback timeout (Lottie が onComplete を出さない場合の保険)
   */
  useEffect(() => {
    const timer = setTimeout(handleFinish, MAX_DURATION_MS)
    return () => clearTimeout(timer)
    /** eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  return (
    <div
      onClick={handleFinish}
      style={{
        alignItems: "center",
        background: "radial-gradient(ellipse at center, #1a1f2a 0%, #05080d 80%)",
        cursor: "pointer",
        display: "flex",
        height: "100vh",
        justifyContent: "center",
        left: 0,
        position: "fixed",
        top: 0,
        width: "100vw",
        zIndex: 1000,
      }}
      title="クリックでスキップ"
    >
      <div style={{ height: "min(80vh, 80vw)", width: "min(80vh, 80vw)" }}>
        <DotLottieReact
          autoplay
          dotLottieRefCallback={(instance: DotLottie | null) => {
            if (instance) {
              instance.addEventListener("complete", handleFinish)
            }
          }}
          loop={false}
          src="/celebration.lottie"
          style={{ height: "100%", width: "100%" }}
        />
      </div>
    </div>
  )
}
