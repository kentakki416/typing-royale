"use client"

import { useEffect, useRef, useState } from "react"

type MilestoneKind = "urgent-30" | "urgent-10"

type Options = {
  /**
   * カウントダウン総時間 (ms)。combo 時間ボーナスで動的延長されるため、
   * 「初期値」として扱う。後から `extendDuration(ms)` で増やせる
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
  /**
   * 残り 10 秒以降、1 秒ごと（10,9,…,1）に呼ばれる。カウントダウン SE 用。
   * extendDuration で 10 秒超に伸びた後、再び 10 秒を下回れば再度鳴り始める
   */
  onCountdownTick?: (secondsLeft: number) => void
}

type Result = {
  remainingMs: number
  /**
   * `performance.now()` ベースの開始時刻。mount 直後に countdown が初期化する。
   * 他フック (typing engine / ghost playback) が elapsed 時刻計算に共有して使う
   */
  startAtRef: React.MutableRefObject<number>
  /**
   * combo 時間ボーナスでセッション残り時間を動的に延長する。
   * `extraMs` ぶん残り時間が増え、urgent-30 / urgent-10 演出が
   * 「再び境界を下回る」ようになれば再度発火する
   */
  extendDuration: (extraMs: number) => void
}

/**
 * 120 秒（または `durationMs`）プレイ時間の rAF カウントダウン。
 *
 * - 残り 30s / 10s をまたいだ瞬間に `onTierMilestone(kind)` で通知（演出 / SE 用 hook ポイント）
 * - 残り 0 に達したら `onTimeUp` を呼んで rAF を停止
 * - `startAtRef` を返すので、同じ tick 起点で `elapsedMs` を計算したい他フックが参照できる
 * - `extendDuration(extraMs)` を呼ぶと durationMs が動的に増え、残り時間も伸びる
 */
export function useCountdown({
  durationMs,
  onCountdownTick,
  onTierMilestone,
  onTimeUp,
}: Options): Result {
  const [remainingMs, setRemainingMs] = useState(durationMs)

  const startAtRef = useRef<number>(0)
  /**
   * combo 時間ボーナスで動的延長される現在の総セッション時間。
   * 初回 `durationMs` 引数 + 延長秒数の累積
   */
  const durationMsRef = useRef(durationMs)
  /**
   * 残り 30 秒 / 10 秒の境界で 1 度だけ urgent 演出を出すための gate
   */
  const fired30Ref = useRef(false)
  const fired10Ref = useRef(false)
  /**
   * 直近に tick を鳴らした残り秒数。秒が変わるたびに 1 回だけ tick を鳴らすための gate
   */
  const lastTickSecRef = useRef(0)
  /**
   * コールバックを最新参照に保つ（render 中に ref を書き換えるのは
   * React の警告対象なので useEffect で同期させる）
   */
  const onTimeUpRef = useRef(onTimeUp)
  const onTierMilestoneRef = useRef(onTierMilestone)
  const onCountdownTickRef = useRef(onCountdownTick)
  useEffect(() => {
    onTimeUpRef.current = onTimeUp
    onTierMilestoneRef.current = onTierMilestone
    onCountdownTickRef.current = onCountdownTick
  }, [onTimeUp, onTierMilestone, onCountdownTick])

  useEffect(() => {
    startAtRef.current = performance.now()
    let raf = 0
    const tick = () => {
      const elapsed = performance.now() - startAtRef.current
      const remaining = Math.max(0, durationMsRef.current - elapsed)
      setRemainingMs(remaining)

      if (!fired30Ref.current && remaining <= 30_000 && remaining > 10_000) {
        fired30Ref.current = true
        onTierMilestoneRef.current?.("urgent-30")
      }
      if (!fired10Ref.current && remaining <= 10_000 && remaining > 0) {
        fired10Ref.current = true
        onTierMilestoneRef.current?.("urgent-10")
      }

      /**
       * 残り 10 秒以降は秒が変わるたびに 1 回ずつ tick を鳴らす（10,9,…,1 のカウントダウン）
       */
      const secLeft = Math.ceil(remaining / 1000)
      if (secLeft <= 10 && secLeft >= 1 && secLeft !== lastTickSecRef.current) {
        lastTickSecRef.current = secLeft
        onCountdownTickRef.current?.(secLeft)
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

  const extendDuration = (extraMs: number) => {
    if (extraMs <= 0) return
    durationMsRef.current += extraMs
    /**
     * 延長によって残り時間が境界を再び上回ったら、urgent 演出を再発火できるよう
     * 該当 gate を再開する
     */
    const newRemaining = Math.max(
      0,
      durationMsRef.current - (performance.now() - startAtRef.current),
    )
    if (newRemaining > 30_000) fired30Ref.current = false
    if (newRemaining > 10_000) fired10Ref.current = false
  }

  return { extendDuration, remainingMs, startAtRef }
}
