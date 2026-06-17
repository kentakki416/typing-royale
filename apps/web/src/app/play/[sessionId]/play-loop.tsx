"use client"

import React, { useEffect, useRef, useState } from "react"

import { FinishGuestPlaySessionResponse, FinishPlaySessionResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import type { BonusEvent } from "@/libs/combo-time-bonus"
import { playFinish, playTimeBonus, playUrgentTick } from "@/libs/sound-fx"

import type { GhostKeystrokeLogs, GhostSummary, GhostUserDisplay } from "./types"
import { useCountdown } from "./use-countdown"
import { useGhostPlayback } from "./use-ghost-playback"
import { useTypingEngine } from "./use-typing-engine"

/**
 * 中央から広がる ring pulse の delay 設定 (3 本を時間差で発射)
 */
const RING_DELAYS = [0, 1.2, 2.4]

/**
 * tier アップ時に combo banner から放射状に飛び出す水玉の方向 (10 個)
 */
const DROPLET_COUNT = 10
const DROPLET_DISTANCE = 90
const DROPLETS = Array.from({ length: DROPLET_COUNT }, (_, i) => {
  const angle = (i / DROPLET_COUNT) * Math.PI * 2
  return {
    dx: Math.round(Math.cos(angle) * DROPLET_DISTANCE),
    dy: Math.round(Math.sin(angle) * DROPLET_DISTANCE),
  }
})

type Problem = StartSoloPlaySessionResponse["problems"][number]

type Props = {
  /**
   * 神々モードのみ：神のキーストロークログ
   */
  ghostKeystrokeLogs: GhostKeystrokeLogs | null
  /**
   * 神々モードのみ：神の表示情報
   */
  ghostUserDisplay: GhostUserDisplay | null
  /**
   * 未ログインプレイ。/finish の endpoint と body 形を切替えるのに使う
   */
  isGuest: boolean
  mode: "challenge_gods" | "solo"
  /**
   * /finish のレスポンスを ResultScreen に渡すため、結果データ付きで通知
   * （API 失敗時は null が渡る）。神々モードでは GhostSummary も同時に渡す
   */
  onFinished: (result: FinishPlaySessionResponse | null, ghostSummary: GhostSummary | null) => void
  /**
   * このセッションで実際に出題された problem.id を出題順で並べたもの。
   * ゲスト用 /finish のリクエストボディに転送する
   */
  problemIds: number[]
  problems: Problem[]
  sessionId: string
}

const SESSION_DURATION_MS = 120_000

type FlashKind = "hit" | "miss" | "tier-up" | "urgent"

/**
 * 120 秒プレイループ本体（プレゼンテーション層）
 *
 * ロジックは 3 つのカスタムフックに分離:
 * - `useCountdown`: rAF で 120 秒カウントダウン + 30s/10s urgent 演出 + 時間切れで finish 起動
 * - `useTypingEngine`: keydown を購読して cursor / typedChars / combo / accuracy / log を蓄積
 * - `useGhostPlayback`: 神々モード時に ghost の keystroke log を elapsedMs 同期で消費
 *
 * このコンポーネント自身は `finish` (POST /finish を 1 度だけ叩く) + フラッシュ演出の
 * 集約 + HUD / エディタ / 神サイドバーの描画のみを担当する
 */
export function PlayLoop({ ghostKeystrokeLogs, ghostUserDisplay, isGuest, mode, onFinished, problemIds, problems, sessionId }: Props) {
  /**
   * tier アップ / Miss / 残り 10 秒以下で短時間の演出 class を付与
   */
  const [flashKind, setFlashKind] = useState<FlashKind | null>(null)
  /**
   * flash class を消す setTimeout のキャンセル用
   */
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * `finish` を 1 度だけ走らせる gate。各 hook から参照する
   */
  const finishedRef = useRef(false)

  const triggerFlash = (kind: FlashKind, ms: number) => {
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
    setFlashKind(kind)
    flashTimerRef.current = setTimeout(() => {
      setFlashKind(null)
      flashTimerRef.current = null
    }, ms)
  }

  /**
   * /finish を 1 回だけ叩いて結果フェーズへ遷移
   */
  const finish = async () => {
    if (finishedRef.current) return
    finishedRef.current = true
    playFinish()

    const accuracy = typingRefs.totalRef.current === 0
      ? 0
      : typingRefs.correctRef.current / typingRefs.totalRef.current
    const keystrokeLogs = typingRefs.logRef.current.map((entry) => ({
      elapsed_ms: entry.elapsedMs,
      input_char: entry.inputChar,
      is_correct: entry.isCorrect,
      problem_index: entry.problemIndex,
    }))
    const typedChars = typingRefs.typedCharsRef.current
    let result: FinishPlaySessionResponse | null = null
    try {
      /**
       * isGuest で endpoint と body 形を切替える。
       * - logged-in: /api/play-sessions/{sessionId}/finish (Redis state 経由で problem_ids 確定)
       * - guest:     /api/play-sessions/guest/finish (body に problem_ids を直接含める)
       */
      const url = isGuest
        ? "/api/play-sessions/guest/finish"
        : `/api/play-sessions/${sessionId}/finish`
      const body = isGuest
        ? { accuracy, keystroke_logs: keystrokeLogs, problem_ids: problemIds, typed_chars: typedChars }
        : { accuracy, keystroke_logs: keystrokeLogs, typed_chars: typedChars }
      const res = await fetch(url, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      if (res.ok) {
        if (isGuest) {
          /**
           * ゲスト用レスポンスは ResultScreen が期待する FinishPlaySessionResponse 形に
           * 正規化する。new_rank と total_ranked_players はサーバー側で計算済みなので
           * そのまま渡し、persisted=false で「未保存」UI を出し分ける
           */
          const guestRes = await res.json() as FinishGuestPlaySessionResponse
          result = {
            accuracy: guestRes.accuracy,
            best_score_updated: false,
            grade_up: null,
            mistype_stats: guestRes.mistype_stats,
            /** ゲストはランキング登録対象外なので月間 boundary も常に null */
            monthly_top_ten_boundary_score: null,
            new_rank: guestRes.new_rank,
            persisted: false,
            problems_completed: guestRes.problems_completed,
            problems_played: guestRes.problems_played,
            score: guestRes.score,
            top_ten_boundary_score: null,
            total_ranked_players: guestRes.total_ranked_players,
            typed_chars: guestRes.typed_chars,
          }
        } else {
          result = await res.json() as FinishPlaySessionResponse
        }
      }
    } catch {
      /**
       * 通信失敗時は null を返し、ResultScreen 側でフォールバック表示
       */
    }
    const ghostSummary: GhostSummary | null = mode === "challenge_gods"
      ? {
        accuracy: ghostRefs.ghostTotalRef.current === 0
          ? 0
          : ghostRefs.ghostCorrectRef.current / ghostRefs.ghostTotalRef.current,
        perProblem: ghostRefs.ghostPerProblemRef.current,
        problemIndex: ghostRefs.ghostProblemIndexRef.current,
        totalKeystrokes: ghostRefs.ghostTotalRef.current,
        typedChars: ghostRefs.ghostTypedCharsRef.current,
      }
      : null
    onFinished(result, ghostSummary)
  }

  const { extendDuration, remainingMs, startAtRef } = useCountdown({
    durationMs: SESSION_DURATION_MS,
    onTierMilestone: (kind) => {
      if (kind === "urgent-30") {
        triggerFlash("urgent", 600)
      } else {
        playUrgentTick()
        triggerFlash("urgent", 800)
      }
    },
    onTimeUp: () => {
      void finish()
    },
  })

  /**
   * combo マイルストーン到達時の処理:
   * 1. 残り時間を動的に延長 (extendDuration)
   * 2. 「+Ns」ポップアップを HUD 残り時間の左に spawn (1 秒で fade out)
   * 3. 残り時間 HUD セル自体を gold グロー (0.5 秒)
   * 4. 専用 SE `playTimeBonus` を鳴らす
   */
  const bonusPopupIdRef = useRef(0)
  const [bonusPopups, setBonusPopups] = useState<{ addedSec: number; id: number }[]>([])
  const [timeBonusFlash, setTimeBonusFlash] = useState(false)
  const handleComboBonus = (event: BonusEvent) => {
    extendDuration(event.addedSec * 1000)
    const id = ++bonusPopupIdRef.current
    setBonusPopups((prev) => [...prev, { addedSec: event.addedSec, id }])
    window.setTimeout(() => {
      setBonusPopups((prev) => prev.filter((p) => p.id !== id))
    }, 1000)
    setTimeBonusFlash(true)
    window.setTimeout(() => setTimeBonusFlash(false), 500)
    playTimeBonus()
  }

  const { refs: typingRefs, state: typingState } = useTypingEngine({
    finishedRef,
    onComboBonus: handleComboBonus,
    problems,
    startAtRef,
    triggerFlash,
  })
  const { combo, correctKeystrokes, cursorPos, imeOn, problemIndex, totalKeystrokes, typedChars } = typingState

  const { refs: ghostRefs, state: ghostState } = useGhostPlayback({
    finishedRef,
    ghostKeystrokeLogs,
    mode,
    problems,
    startAtRef,
  })
  const { ghostAccuracy, ghostProblemIndex, ghostTypedChars } = ghostState

  /**
   * body に play-screen クラスを付けることでスクロール抑止＆エディタを画面全高に伸ばす
   */
  useEffect(() => {
    document.body.classList.add("play-screen")
    return () => document.body.classList.remove("play-screen")
  }, [])

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

  /**
   * 10 combo マイルストーン (10, 20, 30, ...) に到達するたびに水玉 burst をリセットして
   * 再生する。`comboTier` は 50 で虹 (tier 6) 固定になるが、虹到達後も 10 ごとに
   * 演出を出したいので tier 変化ではなく `Math.floor(combo / 10)` の変化で発火する。
   * tierBounceKey は wrapper の droplet-burst の `key` に渡し、変化のたびに
   * 再 mount → animation が頭から走る
   */
  const currentComboTier = comboTier(combo)
  const comboDecade = Math.floor(combo / 10)
  const lastComboDecadeRef = useRef<number>(0)
  const [tierBounceKey, setTierBounceKey] = useState(0)
  useEffect(() => {
    if (comboDecade !== lastComboDecadeRef.current && combo > 0) {
      setTierBounceKey((k) => k + 1)
    }
    lastComboDecadeRef.current = comboDecade
  }, [combo, comboDecade])

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

      <Topbar isAuthed={!isGuest} languageBadge="TypeScript" modeBadge={modeBadge} />

      <div className={`container ${screenClass}`} style={{ position: "relative", zIndex: 1 }}>
        <div className="play-hud">
          <div
            className={`hud-cell ${timeBonusFlash ? "time-bonus-flash" : ""}`}
            style={{ position: "relative" }}
          >
            <div className="time-bonus-popups" aria-hidden="true">
              {bonusPopups.map((p) => (
                <span
                  className={`time-bonus-popup time-bonus-popup-${p.addedSec}s`}
                  key={p.id}
                >
                  +{p.addedSec}s
                </span>
              ))}
            </div>
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
                <div className="hud-label">完了数 / 問題数</div>
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
              <div className="combo-banner-wrapper">
                <div className={`combo-banner combo-${currentComboTier}`} key={`banner-${tierBounceKey}`}>
                  <span className="combo-x">×</span>
                  <span className="combo-n">{combo}</span>
                  <span className="combo-label">COMBO</span>
                </div>
                {tierBounceKey > 0 && (
                  <div aria-hidden="true" className={`droplet-burst combo-${currentComboTier}`} key={`burst-${tierBounceKey}`}>
                    {DROPLETS.map((d, i) => (
                      <span
                        className="droplet"
                        key={i}
                        style={{ "--dx": `${d.dx}px`, "--dy": `${d.dy}px` } as React.CSSProperties}
                      />
                    ))}
                  </div>
                )}
              </div>
              {currentProblem && (() => {
                const meta = extractRepoAndPathFromGithubUrl(currentProblem.source_url)
                return (
                  <div className="code-block-source">
                    <span title={currentProblem.function_name}>
                      {meta !== null
                        ? (
                          <>
                            📦 <strong>{meta.repo}</strong> / {meta.path}
                            {meta.lineRange !== null && (
                              <span className="text-muted">:{meta.lineRange}</span>
                            )}
                          </>
                        )
                        : <>📦 {currentProblem.function_name}</>}
                    </span>
                    <a href={currentProblem.source_url} rel="noreferrer noopener" target="_blank">
                      GitHub で見る ↗
                    </a>
                  </div>
                )
              })()}
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
 * source_url から GitHub の "{owner}/{repo}" + ファイルパス + 行範囲を抽出する。
 * 例: https://github.com/microsoft/vscode/blob/<sha>/src/vs/foo.ts#L1-L10
 *     → { repo: "microsoft/vscode", path: "src/vs/foo.ts", lineRange: "L1-L10" }
 * 単一行 (`#L42`) の場合は lineRange = "L42"、フラグメント無しは lineRange = null。
 * URL 全体が想定外フォーマットなら null を返す（呼び出し側で function_name にフォールバック）
 */
const extractRepoAndPathFromGithubUrl = (
  url: string,
): { lineRange: string | null; path: string; repo: string } | null => {
  try {
    const u = new URL(url)
    if (u.host !== "github.com") return null
    const parts = u.pathname.split("/").filter((p) => p !== "")
    /** ["{owner}", "{repo}", "blob", "{ref}", ...path] */
    if (parts.length < 5 || parts[2] !== "blob") return null
    /** GitHub の行範囲フラグメント "L132-L136" / "L42" のみ採用 */
    const hash = u.hash.replace(/^#/, "")
    const lineRange = /^L\d+(-L\d+)?$/.test(hash) ? hash : null
    return {
      lineRange,
      path: parts.slice(4).join("/"),
      repo: `${parts[0]}/${parts[1]}`,
    }
  } catch {
    return null
  }
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
 * combo 数で表示色のティアを返す。背景 tier と同じパレットを 10 combo ごとに切り替える
 * (1: 蒼 / 2: 翠 / 3: 紫 / 4: 紅 / 5: 金 / 6: 虹)
 */
const comboTier = (n: number): 1 | 2 | 3 | 4 | 5 | 6 => {
  if (n >= 50) return 6
  if (n >= 40) return 5
  if (n >= 30) return 4
  if (n >= 20) return 3
  if (n >= 10) return 2
  return 1
}
