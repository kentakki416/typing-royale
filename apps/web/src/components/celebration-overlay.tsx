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
 * リザルト画面に重ねて再生する祝福アニメーション
 *
 * /public/celebration.lottie を半透明背景の overlay として再生し、
 * 再生終了 (or fallback timeout、クリック) で onFinished を呼んで消える。
 * リザルト内容は overlay の下で既にレンダリング済み。
 */
const MAX_DURATION_MS = 4500

export function CelebrationOverlay({ onFinished }: Props) {
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
        /**
         * 裏のリザルト（ドット背景含む）が透けて見える程度の半透明黒 + 中央 spot light。
         * alpha を上げすぎると背景デザインが潰れるので、中心は薄め・外側もドットが視認できる強度に抑える
         */
        background: "radial-gradient(ellipse at center, rgba(26, 31, 42, 0.3) 0%, rgba(5, 8, 13, 0.55) 80%)",
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
