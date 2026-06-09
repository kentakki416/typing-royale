"use client"

import { useEffect, useRef, useState } from "react"

import { StartSoloPlaySessionResponse } from "@repo/api-schema"

import type { GhostKeystrokeLogs } from "./types"

type Problem = StartSoloPlaySessionResponse["problems"][number]

type PerProblem = {
  completed: boolean
  orderIndex: number
  typedChars: number
}

type Options = {
  /**
   * `finish` 済みになったら rAF を止めるための共有 ref
   */
  finishedRef: React.MutableRefObject<boolean>
  /**
   * 神々モードのみ：神のキーストロークログ。null なら無効
   */
  ghostKeystrokeLogs: GhostKeystrokeLogs | null
  mode: "challenge_gods" | "solo"
  problems: Problem[]
  /**
   * countdown と揃えた `performance.now()` 起点
   */
  startAtRef: React.MutableRefObject<number>
}

type State = {
  ghostAccuracy: number
  ghostProblemIndex: number
  ghostTypedChars: number
}

type Refs = {
  ghostCorrectRef: React.MutableRefObject<number>
  ghostPerProblemRef: React.MutableRefObject<PerProblem[]>
  ghostProblemIndexRef: React.MutableRefObject<number>
  ghostTotalRef: React.MutableRefObject<number>
  ghostTypedCharsRef: React.MutableRefObject<number>
}

type Result = {
  refs: Refs
  state: State
}

/**
 * 神々モードの ghost プレイバック。
 *
 * - countdown と同じ `startAtRef` 起点で `elapsedMs` を計算
 * - rAF tick で `ghost_keystroke_logs` を経過時刻順に消費し、累計 / 現在問題 / 正確率を更新
 * - `mode !== "challenge_gods"` または `ghostKeystrokeLogs === null` のときは何もしない
 * - `finishedRef.current` が true になったら rAF を止める
 *
 * 各 ref は play-loop 側の `/finish` 呼び出しで `GhostSummary` を組み立てるのに参照する
 */
export function useGhostPlayback({ finishedRef, ghostKeystrokeLogs, mode, problems, startAtRef }: Options): Result {
  const [ghostTypedChars, setGhostTypedChars] = useState(0)
  const [ghostAccuracy, setGhostAccuracy] = useState(0)
  const [ghostProblemIndex, setGhostProblemIndex] = useState(0)

  /**
   * ghost log を elapsedMs 順に消費していくカーソル
   */
  const ghostLogRef = useRef<GhostKeystrokeLogs>(ghostKeystrokeLogs ?? [])
  const ghostCursorRef = useRef(0)
  const ghostTypedCharsRef = useRef(0)
  const ghostCorrectRef = useRef(0)
  const ghostTotalRef = useRef(0)
  const ghostProblemIndexRef = useRef(0)
  /**
   * 各問題の神の完走状況。problemIndex がインクリメントしたタイミングでひとつ前を完走扱いに
   */
  const ghostPerProblemRef = useRef<PerProblem[]>(
    problems.map((_, i) => ({ completed: false, orderIndex: i, typedChars: 0 })),
  )

  useEffect(() => {
    if (mode !== "challenge_gods") return
    let raf = 0
    const tick = () => {
      if (finishedRef.current) return
      const elapsed = performance.now() - startAtRef.current
      const log = ghostLogRef.current
      let consumed = false
      while (ghostCursorRef.current < log.length && log[ghostCursorRef.current].elapsed_ms <= elapsed) {
        const entry = log[ghostCursorRef.current]
        ghostTotalRef.current += 1
        if (entry.is_correct) {
          ghostCorrectRef.current += 1
          ghostTypedCharsRef.current += 1
          const slot = ghostPerProblemRef.current[entry.problem_index]
          if (slot) {
            slot.typedChars += 1
          }
        }
        if (entry.problem_index > ghostProblemIndexRef.current) {
          const prev = ghostPerProblemRef.current[ghostProblemIndexRef.current]
          if (prev) {
            prev.completed = true
          }
          ghostProblemIndexRef.current = entry.problem_index
        }
        ghostCursorRef.current += 1
        consumed = true
      }
      if (consumed) {
        setGhostTypedChars(ghostTypedCharsRef.current)
        setGhostProblemIndex(ghostProblemIndexRef.current)
        setGhostAccuracy(ghostTotalRef.current === 0 ? 0 : ghostCorrectRef.current / ghostTotalRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, finishedRef, startAtRef])

  return {
    refs: {
      ghostCorrectRef,
      ghostPerProblemRef,
      ghostProblemIndexRef,
      ghostTotalRef,
      ghostTypedCharsRef,
    },
    state: {
      ghostAccuracy,
      ghostProblemIndex,
      ghostTypedChars,
    },
  }
}
