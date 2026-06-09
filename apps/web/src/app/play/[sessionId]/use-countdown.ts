"use client"

import { useEffect, useRef, useState } from "react"

type MilestoneKind = "urgent-30" | "urgent-10"

type Options = {
  /**
   * カウントダウン総時間 (ms)
   */
  durationMs: number
  /**
   * カウントダウンが 0 に達したときに 1 度だけ呼ばれる
   */
  onTimeUp: () => void
  /**
   * 残り 30s / 10s の境界をまたいだ瞬間に 1 度だけ呼ばれる
   */
  onTierMilestone?: (kind: MilestoneKind) => void
}

type Result = {
  remainingMs: number
  /**
   * `performance.now()` ベースの開始時刻。mount 直後に countdown が初期化する。
   * 他フック (typing engine / ghost playback) が elapsed 時刻計算に共有して使う
   */
  startAtRef: React.MutableRefObject<number>
}

/**
 * 120 秒（または `durationMs`）プレイ時間の rAF カウントダウン。
 *
 * - 残り 30s / 10s をまたいだ瞬間に `onTierMilestone(kind)` で通知（演出 / SE 用 hook ポイント）
 * - 残り 0 に達したら `onTimeUp` を呼んで rAF を停止
 * - `startAtRef` を返すので、同じ tick 起点で `elapsedMs` を計算したい他フックが参照できる
 */
export function useCountdown({ durationMs, onTierMilestone, onTimeUp }: Options): Result {
  const [remainingMs, setRemainingMs] = useState(durationMs)

  const startAtRef = useRef<number>(0)
  /**
   * 残り 30 秒 / 10 秒の境界で 1 度だけ urgent 演出を出すための gate
   */
  const fired30Ref = useRef(false)
  const fired10Ref = useRef(false)
  /**
   * コールバックを最新参照に保つ（render 中に ref を書き換えるのは
   * React の警告対象なので useEffect で同期させる）
   */
  const onTimeUpRef = useRef(onTimeUp)
  const onTierMilestoneRef = useRef(onTierMilestone)
  useEffect(() => {
    onTimeUpRef.current = onTimeUp
    onTierMilestoneRef.current = onTierMilestone
  }, [onTimeUp, onTierMilestone])

  useEffect(() => {
    startAtRef.current = performance.now()
    let raf = 0
    const tick = () => {
      const elapsed = performance.now() - startAtRef.current
      const remaining = Math.max(0, durationMs - elapsed)
      setRemainingMs(remaining)

      if (!fired30Ref.current && remaining <= 30_000 && remaining > 10_000) {
        fired30Ref.current = true
        onTierMilestoneRef.current?.("urgent-30")
      }
      if (!fired10Ref.current && remaining <= 10_000 && remaining > 0) {
        fired10Ref.current = true
        onTierMilestoneRef.current?.("urgent-10")
      }

      if (remaining <= 0) {
        onTimeUpRef.current()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    /** eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [durationMs])

  return { remainingMs, startAtRef }
}
