"use client"

import { useEffect, useRef, useState } from "react"

import { StartSoloPlaySessionResponse } from "@repo/api-schema"

type Problem = StartSoloPlaySessionResponse["problems"][number]

type KeystrokeEntry = {
  elapsedMs: number
  inputChar: string
  isCorrect: boolean
  problemIndex: number
}

type Props = {
  onFinished: () => void
  problems: Problem[]
  sessionId: string
}

const SESSION_DURATION_MS = 120_000

/**
 * 120 秒プレイループ本体
 *
 * - rAF で 120 秒カウントダウン
 * - document の keydown を購読して入力判定 + keystroke log 蓄積
 * - 関数完走で次の問題へ自動切替
 * - 120 秒経過 / 全完走で /finish を 1 回だけ叩く
 */
export function PlayLoop({ onFinished, problems, sessionId }: Props) {
  const [problemIndex, setProblemIndex] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0)
  const [remainingMs, setRemainingMs] = useState(SESSION_DURATION_MS)
  const [imeOn, setImeOn] = useState(false)

  /**
   * rAF / keydown ハンドラから読み書きする mutable ref
   */
  const startAtRef = useRef<number>(0)
  const problemIndexRef = useRef(0)
  const cursorPosRef = useRef(0)
  const typedCharsRef = useRef(0)
  const totalRef = useRef(0)
  const correctRef = useRef(0)
  const logRef = useRef<KeystrokeEntry[]>([])
  const finishedRef = useRef(false)

  /**
   * /finish を 1 回だけ叩いて結果フェーズへ遷移
   */
  const finish = async () => {
    if (finishedRef.current) return
    finishedRef.current = true

    const accuracy = totalRef.current === 0 ? 0 : correctRef.current / totalRef.current
    try {
      await fetch(`/api/play-sessions/${sessionId}/finish`, {
        body: JSON.stringify({
          accuracy,
          keystroke_logs: logRef.current.map((entry) => ({
            elapsed_ms: entry.elapsedMs,
            input_char: entry.inputChar,
            is_correct: entry.isCorrect,
            problem_index: entry.problemIndex,
          })),
          typed_chars: typedCharsRef.current,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    } catch {
      /**
       * step5 でリザルトに「保存に失敗」を表示。本 step では握りつぶす
       */
    }
    onFinished()
  }

  /**
   * 120 秒タイマー（rAF）
   */
  useEffect(() => {
    startAtRef.current = performance.now()
    let raf = 0
    const tick = () => {
      const elapsed = performance.now() - startAtRef.current
      const remaining = Math.max(0, SESSION_DURATION_MS - elapsed)
      setRemainingMs(remaining)
      if (remaining <= 0) {
        void finish()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    /** eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  /**
   * keydown / paste / IME 検知ハンドラ
   */
  useEffect(() => {
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

      const currentProblem = problems[problemIndexRef.current]
      if (!currentProblem) return

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
         * 関数完走判定
         */
        if (cursorPosRef.current >= currentProblem.code_block.length) {
          problemIndexRef.current += 1
          cursorPosRef.current = 0
          setProblemIndex(problemIndexRef.current)
          setCursorPos(0)
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
  }, [problems, imeOn])

  const currentProblem = problems[problemIndex] ?? null
  const allDone = problemIndex >= problems.length
  const accuracy = totalKeystrokes === 0 ? 0 : correctKeystrokes / totalKeystrokes

  return (
    <main className="flex min-h-screen flex-col bg-zinc-50 px-6 py-6 dark:bg-zinc-950">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <span className="text-3xl font-bold tabular-nums">
            {Math.ceil(remainingMs / 1000)}
          </span>
          <span className="ml-1 text-sm text-gray-500">秒</span>
        </div>
        <div className="space-x-4 text-sm text-gray-600 dark:text-gray-300">
          <span>{typedChars} 文字</span>
          <span>{(accuracy * 100).toFixed(1)}%</span>
          <span>
            {problemIndex} / {problems.length} 問
          </span>
        </div>
      </header>

      {imeOn && (
        <div className="mb-4 rounded bg-yellow-100 px-4 py-3 text-sm text-yellow-900">
          IME を OFF にしてください
        </div>
      )}

      <section className="flex-1 rounded-lg border border-gray-200 bg-white p-6 font-mono text-base dark:border-zinc-800 dark:bg-zinc-900">
        {allDone ? (
          <p className="text-center text-2xl text-green-600">お見事！全問完走</p>
        ) : currentProblem ? (
          <pre className="whitespace-pre-wrap break-words">
            {renderCode(currentProblem.code_block, cursorPos)}
          </pre>
        ) : null}
      </section>

      <footer className="mt-3 text-right text-xs text-gray-500">
        {currentProblem && (
          <span>
            {currentProblem.function_name}
            <a
              className="ml-2 underline"
              href={currentProblem.source_url}
              rel="noreferrer noopener"
              target="_blank"
            >
              GitHub
            </a>
          </span>
        )}
      </footer>
    </main>
  )
}

/**
 * 打鍵済み（緑）/ 現在位置（ハイライト）/ 未打鍵（gray）で色分け
 */
const renderCode = (code: string, cursor: number) => {
  return (
    <>
      <span className="text-green-600">{code.slice(0, cursor)}</span>
      <span className="bg-blue-200 dark:bg-blue-900">{code[cursor] ?? ""}</span>
      <span className="text-gray-400">{code.slice(cursor + 1)}</span>
    </>
  )
}
