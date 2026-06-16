"use client"

import { useEffect, useRef, useState } from "react"

import { StartSoloPlaySessionResponse } from "@repo/api-schema"

import { playKeyHit, playKeyMiss, playTierUp, resumeAudio } from "@/libs/sound-fx"

type Problem = StartSoloPlaySessionResponse["problems"][number]

export type KeystrokeEntry = {
  elapsedMs: number
  inputChar: string
  isCorrect: boolean
  problemIndex: number
}

type FlashKind = "hit" | "miss" | "tier-up" | "urgent"

type Options = {
  /**
   * `finish` 済みかを示す共有 ref。true の間は keydown を無視する
   */
  finishedRef: React.MutableRefObject<boolean>
  problems: Problem[]
  /**
   * countdown と揃えた `performance.now()` 起点
   */
  startAtRef: React.MutableRefObject<number>
  /**
   * Hit / Miss / Tier-Up の演出フラッシュ通知
   */
  triggerFlash: (kind: FlashKind, ms: number) => void
}

type State = {
  combo: number
  correctKeystrokes: number
  cursorPos: number
  imeOn: boolean
  maxCombo: number
  problemIndex: number
  totalKeystrokes: number
  typedChars: number
}

type Refs = {
  correctRef: React.MutableRefObject<number>
  logRef: React.MutableRefObject<KeystrokeEntry[]>
  totalRef: React.MutableRefObject<number>
  typedCharsRef: React.MutableRefObject<number>
}

type Result = {
  refs: Refs
  state: State
}

/**
 * 入力エンジン: document の keydown を購読して
 *
 * - cursor / problemIndex / typedChars / combo / maxCombo / accuracy を更新
 * - keystroke log を蓄積（`/finish` に POST する用）
 * - Hit / Miss / tier-up の SE と flash 演出をトリガー
 * - IME / paste / Backspace は無視
 * - `finishedRef.current` が true の間は無視
 *
 * tier 切り替え（typedChars 100/200/300/400/500）は内部で検知し、上がったら
 * `playTierUp()` + `triggerFlash("tier-up", 700)` を発火する
 */
export function useTypingEngine({ finishedRef, problems, startAtRef, triggerFlash }: Options): Result {
  const [problemIndex, setProblemIndex] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0)
  const [imeOn, setImeOn] = useState(false)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)

  /**
   * keydown ハンドラから読み書きする mutable ref（setState は描画用、refs は最新値読み取り用）
   */
  const problemIndexRef = useRef(0)
  const cursorPosRef = useRef(0)
  const typedCharsRef = useRef(0)
  const totalRef = useRef(0)
  const correctRef = useRef(0)
  const logRef = useRef<KeystrokeEntry[]>([])
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const tierRef = useRef(1)
  /**
   * triggerFlash の参照を最新に保つ（毎レンダーで新しい関数になるため、
   * useEffect 依存に直接入れると keydown ハンドラが毎回付け替わってしまう）
   */
  const triggerFlashRef = useRef(triggerFlash)
  useEffect(() => {
    triggerFlashRef.current = triggerFlash
  }, [triggerFlash])

  useEffect(() => {
    /**
     * 1 文字スキップして log + カウンタに積むヘルパ。
     * 関数末尾を超えたら次の問題の先頭に切替える
     */
    const consumeOneAsSkipped = (problem: Problem, ch: string) => {
      const elapsed = performance.now() - startAtRef.current
      logRef.current.push({
        elapsedMs: elapsed,
        inputChar: ch,
        isCorrect: true,
        problemIndex: problemIndexRef.current,
      })
      totalRef.current += 1
      correctRef.current += 1
      typedCharsRef.current += 1
      cursorPosRef.current += 1
      if (cursorPosRef.current >= problem.code_block.length) {
        problemIndexRef.current += 1
        cursorPosRef.current = 0
      }
    }

    /**
     * カーソル位置が改行 (`\n`) の場合のみ、改行 + 後続の行頭 whitespace
     * (スペース / タブ) を自動でスキップする。行中の単独スペースは飛ばさない
     */
    const advanceAcrossNewlineAndIndent = () => {
      const problem0 = problems[problemIndexRef.current]
      if (!problem0) return
      const head = problem0.code_block[cursorPosRef.current]
      if (head !== "\n") return
      while (true) {
        const problem = problems[problemIndexRef.current]
        if (!problem) return
        const ch = problem.code_block[cursorPosRef.current]
        if (ch !== " " && ch !== "\t" && ch !== "\n") return
        consumeOneAsSkipped(problem, ch)
      }
    }

    /**
     * Shift+Enter 用: カーソル位置から次の非空白文字まで強制的に飛ばす。
     * 行中のスペースを手動で飛ばしたいときの手動 shortcut
     */
    const advanceThroughAllWhitespace = () => {
      while (true) {
        const problem = problems[problemIndexRef.current]
        if (!problem) return
        const ch = problem.code_block[cursorPosRef.current]
        if (ch !== " " && ch !== "\t" && ch !== "\n") return
        consumeOneAsSkipped(problem, ch)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (finishedRef.current || imeOn) return
      /**
       * 特殊キーの除外（Shift/Ctrl/Alt/Meta 単独）
       */
      if (e.key.length > 1 && e.key !== "Enter" && e.key !== "Backspace") return
      /**
       * Backspace は無視（仕様：誤入力時は次の正解文字が打たれるまで進まない）
       */
      if (e.key === "Backspace") {
        e.preventDefault()
        return
      }

      /**
       * Shift+Enter: 手動で次の非空白文字まで強制スキップ。
       * 行中のスペースを飛ばして「次の文字列」に移動する shortcut
       */
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault()
        advanceThroughAllWhitespace()
        setProblemIndex(problemIndexRef.current)
        setCursorPos(cursorPosRef.current)
        setTypedChars(typedCharsRef.current)
        setCorrectKeystrokes(correctRef.current)
        setTotalKeystrokes(totalRef.current)
        return
      }

      /**
       * 入力を処理する前に、カーソルが改行上ならまとめてスキップする。
       * 改行直後のインデントもまとめて飛ばすので、次の打鍵は新しい行の最初の
       * 非空白文字に当たる
       */
      const cursorBeforeSkip = cursorPosRef.current
      const problemBeforeSkip = problemIndexRef.current
      advanceAcrossNewlineAndIndent()
      const didSkip = cursorPosRef.current !== cursorBeforeSkip || problemIndexRef.current !== problemBeforeSkip

      const currentProblem = problems[problemIndexRef.current]
      if (!currentProblem) {
        if (didSkip) {
          setProblemIndex(problemIndexRef.current)
          setCursorPos(cursorPosRef.current)
          setTypedChars(typedCharsRef.current)
          setTotalKeystrokes(totalRef.current)
          setCorrectKeystrokes(correctRef.current)
        }
        return
      }

      const expectedChar = currentProblem.code_block[cursorPosRef.current]
      /**
       * Enter は改行扱い
       */
      const inputChar = e.key === "Enter" ? "\n" : e.key
      const isCorrect = inputChar === expectedChar

      e.preventDefault()

      const elapsed = performance.now() - startAtRef.current
      logRef.current.push({
        elapsedMs: elapsed,
        inputChar: e.key,
        isCorrect,
        problemIndex: problemIndexRef.current,
      })

      /**
       * 初回 keydown で AudioContext を resume（ブラウザ autoplay policy 対策）
       */
      resumeAudio()

      totalRef.current += 1
      setTotalKeystrokes(totalRef.current)
      if (isCorrect) {
        correctRef.current += 1
        setCorrectKeystrokes(correctRef.current)
        typedCharsRef.current += 1
        setTypedChars(typedCharsRef.current)
        cursorPosRef.current += 1
        setCursorPos(cursorPosRef.current)

        /**
         * combo 増加 + max 更新 + 正解 SE
         */
        comboRef.current += 1
        setCombo(comboRef.current)
        if (comboRef.current > maxComboRef.current) {
          maxComboRef.current = comboRef.current
          setMaxCombo(maxComboRef.current)
        }
        playKeyHit(comboRef.current)

        /**
         * tier change 検知 (typedChars 100/200/300/400/500 の境界)
         */
        const newTier = typedCharsRef.current >= 500 ? 6
          : typedCharsRef.current >= 400 ? 5
            : typedCharsRef.current >= 300 ? 4
              : typedCharsRef.current >= 200 ? 3
                : typedCharsRef.current >= 100 ? 2
                  : 1
        if (newTier > tierRef.current) {
          tierRef.current = newTier
          playTierUp()
          triggerFlashRef.current("tier-up", 700)
        }

        /**
         * 関数完走判定
         */
        if (cursorPosRef.current >= currentProblem.code_block.length) {
          problemIndexRef.current += 1
          cursorPosRef.current = 0
        }

        /**
         * 正解直後にカーソルが改行上に来ていれば、改行 + 後続インデントをまとめて飛ばす
         */
        advanceAcrossNewlineAndIndent()
        setProblemIndex(problemIndexRef.current)
        setCursorPos(cursorPosRef.current)
        setTypedChars(typedCharsRef.current)
        setCorrectKeystrokes(correctRef.current)
        setTotalKeystrokes(totalRef.current)
      } else {
        /**
         * Miss: combo リセット + Miss SE + 短い shake 演出
         */
        if (comboRef.current > 0) {
          comboRef.current = 0
          setCombo(0)
        }
        playKeyMiss()
        triggerFlashRef.current("miss", 250)
        /** ハンドラ先頭で skip した場合は state を同期 */
        if (didSkip) {
          setProblemIndex(problemIndexRef.current)
          setCursorPos(cursorPosRef.current)
          setTypedChars(typedCharsRef.current)
          setCorrectKeystrokes(correctRef.current)
        }
      }
    }
    const onPaste = (e: ClipboardEvent) => e.preventDefault()
    const onCompositionStart = () => setImeOn(true)
    const onCompositionEnd = () => setImeOn(false)

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("paste", onPaste)
    document.addEventListener("compositionstart", onCompositionStart)
    document.addEventListener("compositionend", onCompositionEnd)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("paste", onPaste)
      document.removeEventListener("compositionstart", onCompositionStart)
      document.removeEventListener("compositionend", onCompositionEnd)
    }
  }, [problems, imeOn, finishedRef, startAtRef])

  return {
    refs: {
      correctRef,
      logRef,
      totalRef,
      typedCharsRef,
    },
    state: {
      combo,
      correctKeystrokes,
      cursorPos,
      imeOn,
      maxCombo,
      problemIndex,
      totalKeystrokes,
      typedChars,
    },
  }
}
