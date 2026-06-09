"use client"

import React, { useEffect, useRef, useState } from "react"

import { FinishPlaySessionResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { playFinish, playKeyHit, playKeyMiss, playTierUp, playUrgentTick, resumeAudio } from "@/libs/sound-fx"

import type { GhostKeystrokeLogs, GhostSummary, GhostUserDisplay } from "./types"

/**
 * 中央から広がる ring pulse の delay 設定 (3 本を時間差で発射)
 */
const RING_DELAYS = [0, 1.2, 2.4]

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
   * コンボ: 連続正解数。Miss でリセット
   */
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  /**
   * tier アップ / Miss / 残り 10 秒以下で短時間の演出 class を付与
   */
  const [flashKind, setFlashKind] = useState<"hit" | "miss" | "tier-up" | "urgent" | null>(null)

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
   * keydown 内から最新値を読みたい combo / tier
   */
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const tierRef = useRef(1)
  /**
   * 残り 30 秒 / 10 秒の境界で 1 度だけ urgent 演出を出すための gate
   */
  const fired30Ref = useRef(false)
  const fired10Ref = useRef(false)
  /**
   * flash class を消す setTimeout のキャンセル用
   */
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerFlash = (kind: "hit" | "miss" | "tier-up" | "urgent", ms: number) => {
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
    setFlashKind(kind)
    flashTimerRef.current = setTimeout(() => {
      setFlashKind(null)
      flashTimerRef.current = null
    }, ms)
  }

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
    playFinish()

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

      /**
       * 残り 30 秒 / 10 秒の境界でアラート演出 + SE
       */
      if (!fired30Ref.current && remaining <= 30_000 && remaining > 10_000) {
        fired30Ref.current = true
        triggerFlash("urgent", 600)
      }
      if (!fired10Ref.current && remaining <= 10_000 && remaining > 0) {
        fired10Ref.current = true
        playUrgentTick()
        triggerFlash("urgent", 800)
      }

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
        playKeyHit()

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
          triggerFlash("tier-up", 700)
        }

        /**
         * 関数完走判定
         */
        if (cursorPosRef.current >= currentProblem.code_block.length) {
          problemIndexRef.current += 1
          cursorPosRef.current = 0
          setProblemIndex(problemIndexRef.current)
          setCursorPos(0)
        }
      } else {
        /**
         * Miss: combo リセット + Miss SE + 短い shake 演出
         */
        if (comboRef.current > 0) {
          comboRef.current = 0
          setCombo(0)
        }
        playKeyMiss()
        triggerFlash("miss", 250)
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

  const screenClass = flashKind === null ? "" : `play-flash flash-${flashKind}`

  return (
    <>
      <div aria-hidden="true" className={`play-backdrop tier-${backdropTier} ${screenClass}`}>
        {RING_DELAYS.map((d, i) => (
          <span
            className="play-ring"
            key={i}
            style={{ "--ring-delay": `${d}s` } as React.CSSProperties}
          />
        ))}
      </div>

      <Topbar languageBadge="TypeScript" modeBadge={modeBadge} />

      <div className={`container ${screenClass}`} style={{ position: "relative", zIndex: 1 }}>
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

        {combo >= 5 && (
          <div className={`combo-banner combo-${comboTier(combo)}`} key={combo}>
            <span className="combo-x">×</span>
            <span className="combo-n">{combo}</span>
            <span className="combo-label">COMBO</span>
          </div>
        )}

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

/**
 * combo 数で表示色のティアを返す (1: 青 / 2: 緑 / 3: 紫 / 4: 虹)
 */
const comboTier = (n: number): 1 | 2 | 3 | 4 => {
  if (n >= 30) return 4
  if (n >= 20) return 3
  if (n >= 10) return 2
  return 1
}
