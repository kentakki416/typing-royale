"use client"

import { useEffect, useRef, useState } from "react"

import { FinishPlaySessionResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"

type Problem = StartSoloPlaySessionResponse["problems"][number]

type KeystrokeEntry = {
  elapsedMs: number
  inputChar: string
  isCorrect: boolean
  problemIndex: number
}

type Props = {
  /**
   * /finish のレスポンスを ResultScreen に渡すため、結果データ付きで通知
   * （API 失敗時は null が渡る）
   */
  onFinished: (result: FinishPlaySessionResponse | null) => void
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
    let result: FinishPlaySessionResponse | null = null
    try {
      const res = await fetch(`/api/play-sessions/${sessionId}/finish`, {
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
      if (res.ok) {
        result = await res.json() as FinishPlaySessionResponse
      }
    } catch {
      /**
       * 通信失敗時は null を返し、ResultScreen 側でフォールバック表示
       */
    }
    onFinished(result)
  }

  /**
   * body に play-screen クラスを付けることでスクロール抑止＆エディタを画面全高に伸ばす
   */
  useEffect(() => {
    document.body.classList.add("play-screen")
    return () => document.body.classList.remove("play-screen")
  }, [])

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
  const remainingSec = Math.ceil(remainingMs / 1000)
  const remainingClass = remainingSec <= 30 ? "error" : remainingSec <= 60 ? "accent" : "success"

  return (
    <>
      <Topbar languageBadge="TypeScript" modeBadge="通常モード" />

      <div className="container">
        <div className="play-hud">
          <div className="hud-cell">
            <div className="hud-label">残り時間</div>
            <div className={`hud-value ${remainingClass}`}>{remainingSec}s</div>
          </div>
          <div className="hud-cell">
            <div className="hud-label">累計文字数</div>
            <div className="hud-value accent">{typedChars}</div>
          </div>
          <div className="hud-cell">
            <div className="hud-label">正確率</div>
            <div className="hud-value success">{(accuracy * 100).toFixed(1)}%</div>
          </div>
          <div className="hud-cell">
            <div className="hud-label">完走 / 出題</div>
            <div className="hud-value">{problemIndex} / {problems.length}</div>
          </div>
        </div>

        {imeOn && (
          <div className="card" style={{ borderColor: "var(--warning)", color: "var(--warning)", marginTop: "16px" }}>
            ⚠️ IME を OFF にしてください
          </div>
        )}

        <div className="editor-area" style={{ marginTop: "16px" }}>
          {currentProblem && (
            <div className="code-block-source">
              <span>📦 {currentProblem.function_name}</span>
              <a href={currentProblem.source_url} rel="noreferrer noopener" target="_blank">
                GitHub で見る ↗
              </a>
            </div>
          )}
          <pre className="code-block">
            {allDone ? (
              <span className="success">お見事！全問完走</span>
            ) : currentProblem ? (
              renderCode(currentProblem.code_block, cursorPos)
            ) : null}
          </pre>
        </div>

        <div className="play-foot">
          💡 ペースト無効 · スキップなし · 未解決型はそのまま打鍵 · Backspace 無効
        </div>
      </div>
    </>
  )
}

/**
 * 打鍵済み（緑）/ 現在位置（紫ハイライト）/ 未打鍵（薄色）で色分け
 */
const renderCode = (code: string, cursor: number) => {
  return (
    <>
      <span className="typed">{code.slice(0, cursor)}</span>
      <span className="current">{code[cursor] ?? ""}</span>
      <span className="untyped">{code.slice(cursor + 1)}</span>
    </>
  )
}
