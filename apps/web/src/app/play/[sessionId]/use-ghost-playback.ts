"use client"

import { useEffect, useRef, useState } from "react"

import { StartSoloPlaySessionResponse } from "@repo/api-schema"

import type { GhostKeystrokeLogs } from "./types"

type Problem = StartSoloPlaySessionResponse["problems"][number]

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
  /**
   * 神の現在問題内のカーソル位置（code_block のインデックス）。神エディタの描画に使う
   */
  ghostCursorPos: number
  ghostProblemIndex: number
  ghostTypedChars: number
}

type Refs = {
  ghostCorrectRef: React.MutableRefObject<number>
  ghostProblemIndexRef: React.MutableRefObject<number>
  ghostTotalRef: React.MutableRefObject<number>
  ghostTypedCharsRef: React.MutableRefObject<number>
}

type Result = {
  refs: Refs
  state: State
}

/**
 * カーソルが改行上にあるとき、改行 + 後続の空白（インデント）をまとめて飛ばした位置を返す。
 * タイピングエンジン (`use-typing-engine.ts`) の advanceAcrossNewlineAndIndent と同じ規則で、
 * 神エディタのカーソルを実プレイ時と同じ位置に進める。
 */
const skipNewlineAndIndent = (code: string, pos: number): number => {
  if (code[pos] !== "\n") return pos
  let p = pos
  while (p < code.length && (code[p] === " " || code[p] === "\t" || code[p] === "\n")) {
    p += 1
  }
  return p
}

/**
 * 神々モードの ghost プレイバック。
 *
 * - countdown と同じ `startAtRef` 起点で `elapsedMs` を計算
 * - rAF tick で `ghost_keystroke_logs` を経過時刻順に消費し、累計 / 現在問題 / 正確率 /
 *   現在問題内のカーソル位置を更新する
 * - `mode !== "challenge_gods"` または `ghostKeystrokeLogs === null` のときは何もしない
 * - `finishedRef.current` が true になったら rAF を止める
 *
 * 各 ref は play-loop 側の `/finish` 呼び出しで `GhostSummary` を組み立てるのに参照する
 */
export function useGhostPlayback({ finishedRef, ghostKeystrokeLogs, mode, problems, startAtRef }: Options): Result {
  const [ghostTypedChars, setGhostTypedChars] = useState(0)
  const [ghostAccuracy, setGhostAccuracy] = useState(0)
  const [ghostProblemIndex, setGhostProblemIndex] = useState(0)
  const [ghostCursorPos, setGhostCursorPos] = useState(0)

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
   * 神の現在問題内のカーソル位置（code_block のインデックス）
   */
  const ghostCursorPosRef = useRef(0)

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
        /**
         * このキーストロークが属する問題に切り替える（次問題に進んだらカーソルを 0 に戻す）
         */
        if (entry.problem_index > ghostProblemIndexRef.current) {
          ghostProblemIndexRef.current = entry.problem_index
          const nextCode = problems[entry.problem_index]?.code_block ?? ""
          ghostCursorPosRef.current = skipNewlineAndIndent(nextCode, 0)
        }
        if (entry.is_correct) {
          ghostCorrectRef.current += 1
          ghostTypedCharsRef.current += 1
          const code = problems[ghostProblemIndexRef.current]?.code_block ?? ""
          ghostCursorPosRef.current = skipNewlineAndIndent(code, ghostCursorPosRef.current + 1)
        }
        ghostCursorRef.current += 1
        consumed = true
      }
      if (consumed) {
        setGhostTypedChars(ghostTypedCharsRef.current)
        setGhostProblemIndex(ghostProblemIndexRef.current)
        setGhostCursorPos(ghostCursorPosRef.current)
        setGhostAccuracy(ghostTotalRef.current === 0 ? 0 : ghostCorrectRef.current / ghostTotalRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, finishedRef, problems, startAtRef])

  return {
    refs: {
      ghostCorrectRef,
      ghostProblemIndexRef,
      ghostTotalRef,
      ghostTypedCharsRef,
    },
    state: {
      ghostAccuracy,
      ghostCursorPos,
      ghostProblemIndex,
      ghostTypedChars,
    },
  }
}
