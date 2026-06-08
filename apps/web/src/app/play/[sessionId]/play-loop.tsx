"use client"

import React, { useEffect, useRef, useState } from "react"

import { FinishPlaySessionResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"

import type { GhostKeystrokeLogs, GhostSummary, GhostUserDisplay } from "./types"

/**
 * 12 個のパーティクル設定。横位置 / 遅延 / 速度 / サイズを散らして
 * 「白い玉が下から弾けて昇っていく」演出を作る
 */
const PARTICLE_CONFIG = [
  { delay: 0.0, duration: 6.5, left: 8, size: 10 },
  { delay: 1.4, duration: 7.2, left: 18, size: 6 },
  { delay: 0.7, duration: 5.8, left: 28, size: 14 },
  { delay: 2.2, duration: 6.8, left: 38, size: 8 },
  { delay: 0.3, duration: 7.5, left: 47, size: 12 },
  { delay: 1.8, duration: 6.1, left: 54, size: 9 },
  { delay: 0.9, duration: 7.0, left: 62, size: 7 },
  { delay: 2.6, duration: 5.6, left: 72, size: 13 },
  { delay: 1.1, duration: 6.4, left: 82, size: 8 },
  { delay: 0.5, duration: 7.8, left: 92, size: 10 },
  { delay: 3.0, duration: 6.6, left: 14, size: 6 },
  { delay: 2.0, duration: 7.1, left: 78, size: 11 },
]

type Problem = StartSoloPlaySessionResponse["problems"][number]

type KeystrokeEntry = {
  elapsedMs: number
  inputChar: string
  isCorrect: boolean
  problemIndex: number
}

type Props = {
  /**
   * 神々モードのみ：神のキーストロークログ
   */
  ghostKeystrokeLogs: GhostKeystrokeLogs | null
  /**
   * 神々モードのみ：神の表示情報
   */
  ghostUserDisplay: GhostUserDisplay | null
  mode: "challenge_gods" | "solo"
  /**
   * /finish のレスポンスを ResultScreen に渡すため、結果データ付きで通知
   * （API 失敗時は null が渡る）。神々モードでは GhostSummary も同時に渡す
   */
  onFinished: (result: FinishPlaySessionResponse | null, ghostSummary: GhostSummary | null) => void
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
 * - 神々モード時は同じ rAF tick で ghost の elapsedMs に応じてログを消費し、
 *   神の累計文字数 / 現在問題 / 正確率をリアルタイム更新する
 */
export function PlayLoop({ ghostKeystrokeLogs, ghostUserDisplay, mode, onFinished, problems, sessionId }: Props) {
  const [problemIndex, setProblemIndex] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0)
  const [remainingMs, setRemainingMs] = useState(SESSION_DURATION_MS)
  const [imeOn, setImeOn] = useState(false)

  /**
   * 神々モードの ghost 状態
   */
  const [ghostTypedChars, setGhostTypedChars] = useState(0)
  const [ghostAccuracy, setGhostAccuracy] = useState(0)
  const [ghostProblemIndex, setGhostProblemIndex] = useState(0)

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
   * 神々モード：ghost log を elapsedMs 順に消費していくカーソル
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
  const ghostPerProblemRef = useRef<{ completed: boolean; orderIndex: number; typedChars: number }[]>(
    problems.map((_, i) => ({ completed: false, orderIndex: i, typedChars: 0 })),
  )

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
    const ghostSummary: GhostSummary | null = mode === "challenge_gods"
      ? {
        accuracy: ghostTotalRef.current === 0 ? 0 : ghostCorrectRef.current / ghostTotalRef.current,
        perProblem: ghostPerProblemRef.current,
        problemIndex: ghostProblemIndexRef.current,
        totalKeystrokes: ghostTotalRef.current,
        typedChars: ghostTypedCharsRef.current,
      }
      : null
    onFinished(result, ghostSummary)
  }

  /**
   * body に play-screen クラスを付けることでスクロール抑止＆エディタを画面全高に伸ばす
   */
  useEffect(() => {
    document.body.classList.add("play-screen")
    return () => document.body.classList.remove("play-screen")
  }, [])

  /**
   * 120 秒タイマー（rAF）。神々モードでは同じ tick で ghost log も進める
   */
  useEffect(() => {
    startAtRef.current = performance.now()
    let raf = 0
    const tick = () => {
      const elapsed = performance.now() - startAtRef.current
      const remaining = Math.max(0, SESSION_DURATION_MS - elapsed)
      setRemainingMs(remaining)

      if (mode === "challenge_gods") {
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
      }

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

  const modeBadge = mode === "challenge_gods" ? "⚡ 神々に挑戦" : "通常モード"
  const isChallenge = mode === "challenge_gods" && ghostUserDisplay !== null

  /**
   * typedChars 閾値で背景 tier を決定 (青→緑→紫→赤→金→虹)
   */
  const backdropTier = typedChars >= 500 ? 6
    : typedChars >= 400 ? 5
      : typedChars >= 300 ? 4
        : typedChars >= 200 ? 3
          : typedChars >= 100 ? 2
            : 1

  const diff = typedChars - ghostTypedChars
  const diffSign = diff > 0 ? "+" : ""
  const diffClass = diff > 0 ? "success" : diff < 0 ? "error" : ""

  return (
    <>
      <div aria-hidden="true" className={`play-backdrop tier-${backdropTier}`}>
        {PARTICLE_CONFIG.map((p, i) => (
          <span
            className="play-particle"
            key={i}
            style={{
              "--delay": `${p.delay}s`,
              "--duration": `${p.duration}s`,
              "--left": `${p.left}%`,
              "--size": `${p.size}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <Topbar languageBadge="TypeScript" modeBadge={modeBadge} />

      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div className="play-hud">
          <div className="hud-cell">
            <div className="hud-label">残り時間</div>
            <div className={`hud-value ${remainingClass}`}>{remainingSec}s</div>
          </div>
          {isChallenge ? (
            <>
              <div className="hud-cell">
                <div className="hud-label">あなた</div>
                <div className="hud-value accent">{typedChars}</div>
              </div>
              <div className="hud-cell">
                <div className="hud-label">神</div>
                <div className="hud-value" style={{ color: "var(--gold)" }}>{ghostTypedChars}</div>
              </div>
              <div className="hud-cell">
                <div className="hud-label">差</div>
                <div className={`hud-value ${diffClass}`}>{diffSign}{diff}</div>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {isChallenge && (
          <div className="race">
            <div className="race-row">
              <div className="race-label"><span className="race-dot" />あなた</div>
              <div className="race-bar">
                <div
                  className="race-bar-fill"
                  style={{ width: `${pct(typedChars, problems)}%` }}
                />
              </div>
              <div className="race-percent">{typedChars}</div>
            </div>
            <div className="race-row">
              <div className="race-label"><span className="race-dot ghost" />神</div>
              <div className="race-bar">
                <div
                  className="race-bar-fill ghost"
                  style={{ width: `${pct(ghostTypedChars, problems)}%` }}
                />
              </div>
              <div className="race-percent">{ghostTypedChars}</div>
            </div>
          </div>
        )}

        {imeOn && (
          <div className="card" style={{ borderColor: "var(--warning)", color: "var(--warning)", marginTop: "16px" }}>
            ⚠️ IME を OFF にしてください
          </div>
        )}

        <div className="row gap-16" style={{ marginTop: "16px" }}>
          <div className="col">
            <div className="editor-area">
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
          </div>
          {isChallenge && ghostUserDisplay && (
            <aside className="col-sidebar">
              <div className="card god-frame">
                <div className="card-header">
                  <div className="card-title" style={{ color: "var(--gold-light)" }}>⚡ 今回の神</div>
                </div>
                <div className="flex-center gap-12 mb-8">
                  <span className="avatar">
                    {ghostUserDisplay.display_name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <div className="player-name">{ghostUserDisplay.display_name}</div>
                    <div className="text-sm text-muted">{ghostUserDisplay.grade}</div>
                  </div>
                </div>
                <div className="text-mono text-sm" style={{ color: "var(--gold)" }}>
                  問題 {Math.min(ghostProblemIndex + 1, problems.length)} / {problems.length}
                </div>
                <div className="text-mono text-sm text-muted">
                  正確率 {(ghostAccuracy * 100).toFixed(1)}%
                </div>
                <div className="text-mono text-sm text-muted">
                  神のベスト: {ghostUserDisplay.best_score} pts
                </div>
              </div>
            </aside>
          )}
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

const pct = (chars: number, problems: Problem[]): number => {
  const total = problems.reduce((s, p) => s + p.char_count, 0)
  if (total === 0) return 0
  return Math.min(100, (chars / total) * 100)
}
