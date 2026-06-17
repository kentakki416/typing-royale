"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { GetReplayResponse } from "@repo/api-schema"

import { detectBonuses } from "@/libs/combo-time-bonus"
import { playTimeBonus } from "@/libs/sound-fx"

const SESSION_MS = 120_000
const SPEEDS = [0.5, 1, 1.5, 2] as const

type Props = {
  data: GetReplayResponse
}

/**
 * リプレイ再生コンポーネント（mock: replay.html 準拠）
 *
 * `keystroke_logs` を `elapsed_ms` 順に消費して打鍵を再描画する。
 * 単一の rAF tick で `playTimeRef + speed + paused` を進めることで
 * 再生 / 一時停止 / 倍速 / シーク を統一的に扱う
 */
export function ReplayPlayer({ data }: Props) {
  const { keystroke_logs: logs, language, player, problems, repo_info: repoInfo, stats } = data

  const [playedMs, setPlayedMs] = useState(0)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [typedChars, setTypedChars] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [total, setTotal] = useState(0)
  const [problemIndex, setProblemIndex] = useState(0)
  const [cursor, setCursor] = useState(0)
  /**
   * combo マイルストーン (20 / 40 / 60 以降 20 ごと) を log から事前計算しておき、
   * 再生中の playTimeRef がイベントの elapsedMs を超えた瞬間に +Ns 演出を発火する。
   * 旧仕様 (時間ボーナス導入前) の log は detectBonuses が空配列を返すので何も起きない
   */
  const bonusEvents = useMemo(() => detectBonuses(logs), [logs])
  const [bonusPopups, setBonusPopups] = useState<{ addedSec: number; id: number }[]>([])
  const [timeBonusFlash, setTimeBonusFlash] = useState(false)
  const bonusPopupIdRef = useRef(0)
  const firedBonusIdxRef = useRef(0)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * rAF tick からも触る mutable state
   */
  const playTimeRef = useRef(0)
  const cursorIdxRef = useRef(0)
  const typedCharsRef = useRef(0)
  const correctRef = useRef(0)
  const totalRef = useRef(0)
  const problemIndexRef = useRef(0)
  const cursorPosRef = useRef(0)
  const lastWallRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const speedRef = useRef(1)

  /**
   * combo ボーナス +Ns ポップアップを 1 件発火する。再生 tick 内から呼ばれる。
   * - HUD「経過時間」セル左に span をぽんと出して 1 秒で fade out
   * - hud-cell に time-bonus-flash クラスを 0.5 秒間付与 (gold グロー)
   * - 効果音 playTimeBonus
   */
  const triggerBonusPopup = (addedSec: number) => {
    const id = ++bonusPopupIdRef.current
    setBonusPopups((prev) => [...prev, { addedSec, id }])
    window.setTimeout(() => {
      setBonusPopups((prev) => prev.filter((p) => p.id !== id))
    }, 1000)
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
    setTimeBonusFlash(true)
    flashTimerRef.current = setTimeout(() => {
      setTimeBonusFlash(false)
      flashTimerRef.current = null
    }, 500)
    playTimeBonus()
  }

  /**
   * cursor 状態を最新の playTime に合わせて再計算する
   * (1) 初期マウント (2) シーク後 から呼ぶ
   */
  const recomputeUpTo = (targetMs: number) => {
    cursorIdxRef.current = 0
    typedCharsRef.current = 0
    correctRef.current = 0
    totalRef.current = 0
    problemIndexRef.current = 0
    cursorPosRef.current = 0
    while (cursorIdxRef.current < logs.length && logs[cursorIdxRef.current].elapsed_ms <= targetMs) {
      const entry = logs[cursorIdxRef.current]
      totalRef.current += 1
      if (entry.is_correct) {
        correctRef.current += 1
        typedCharsRef.current += 1
        if (entry.problem_index === problemIndexRef.current) {
          cursorPosRef.current += 1
          const currentProblem = problems[problemIndexRef.current]
          if (currentProblem && cursorPosRef.current >= currentProblem.code_block.length) {
            cursorPosRef.current = 0
          }
        } else if (entry.problem_index > problemIndexRef.current) {
          problemIndexRef.current = entry.problem_index
          cursorPosRef.current = 1
        }
      }
      cursorIdxRef.current += 1
    }
    setTypedChars(typedCharsRef.current)
    setCorrect(correctRef.current)
    setTotal(totalRef.current)
    setProblemIndex(problemIndexRef.current)
    setCursor(cursorPosRef.current)
    /**
     * シーク後の再計算では bonus も同じ位置まで巻き戻し or 早送りする。
     * 「既に発火済み (targetMs 以下) 」だけ通り過ぎたとマークし、
     * targetMs より先のイベントは再度発火対象に戻す (戻し方向シークも対応)
     */
    let newFiredIdx = 0
    while (newFiredIdx < bonusEvents.length && bonusEvents[newFiredIdx].elapsedMs <= targetMs) {
      newFiredIdx += 1
    }
    firedBonusIdxRef.current = newFiredIdx
  }

  /**
   * 単一 rAF。常時走らせて再生 / 一時停止 / 倍速 / シーク を吸収する
   */
  useEffect(() => {
    let raf = 0
    lastWallRef.current = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = now - lastWallRef.current
      lastWallRef.current = now
      if (!pausedRef.current) {
        const next = Math.min(SESSION_MS, playTimeRef.current + dt * speedRef.current)
        playTimeRef.current = next
        while (
          cursorIdxRef.current < logs.length &&
          logs[cursorIdxRef.current].elapsed_ms <= next
        ) {
          const entry = logs[cursorIdxRef.current]
          totalRef.current += 1
          if (entry.is_correct) {
            correctRef.current += 1
            typedCharsRef.current += 1
            if (entry.problem_index === problemIndexRef.current) {
              cursorPosRef.current += 1
              const currentProblem = problems[problemIndexRef.current]
              if (currentProblem && cursorPosRef.current >= currentProblem.code_block.length) {
                cursorPosRef.current = 0
              }
            } else if (entry.problem_index > problemIndexRef.current) {
              problemIndexRef.current = entry.problem_index
              cursorPosRef.current = 1
            }
          }
          cursorIdxRef.current += 1
        }
        /**
         * combo マイルストーン発火: 次の bonus event の elapsedMs が現在の再生時刻を
         * 超えていれば triggerBonusPopup を呼ぶ。tick あたり複数発火する可能性も while で吸収
         */
        while (
          firedBonusIdxRef.current < bonusEvents.length
          && bonusEvents[firedBonusIdxRef.current].elapsedMs <= next
        ) {
          triggerBonusPopup(bonusEvents[firedBonusIdxRef.current].addedSec)
          firedBonusIdxRef.current += 1
        }
        setPlayedMs(next)
        setTypedChars(typedCharsRef.current)
        setCorrect(correctRef.current)
        setTotal(totalRef.current)
        setProblemIndex(problemIndexRef.current)
        setCursor(cursorPosRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    /** eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [logs, problems, bonusEvents])

  const togglePause = () => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
  }

  const seek = (ratio: number) => {
    const target = Math.max(0, Math.min(SESSION_MS, ratio * SESSION_MS))
    playTimeRef.current = target
    recomputeUpTo(target)
    setPlayedMs(target)
  }

  const jumpTo = (ms: number) => {
    const target = Math.max(0, Math.min(SESSION_MS, ms))
    playTimeRef.current = target
    recomputeUpTo(target)
    setPlayedMs(target)
  }

  const changeSpeed = (s: number) => {
    speedRef.current = s
    setSpeed(s)
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    seek(ratio)
  }

  const elapsedSec = Math.floor(playedMs / 1000)
  const accuracy = total === 0 ? 0 : correct / total
  const progressPct = (playedMs / SESSION_MS) * 100
  const currentProblem = problems[problemIndex] ?? null

  return (
    <>
      <div className="flex-between mb-16">
        <div className="flex-center gap-12">
          <PlayerAvatar avatarUrl={player.avatar_url} githubUsername={player.github_username ?? `user${player.user_id}`} />
          <div>
            <h1 style={{ marginBottom: 0 }}>@{player.github_username ?? `user${player.user_id}`} のリプレイ</h1>
            <div className="text-sm text-muted">
              <span className="badge accent" style={{ marginRight: "8px" }}>{LANGUAGE_LABEL[language] ?? language}</span>
              <span>{stats.score.toLocaleString()} pts · {stats.typed_chars.toLocaleString()} 文字 · {(stats.accuracy * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

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
          <div className="hud-label">経過時間</div>
          <div className="hud-value">{formatMs(elapsedSec)} / 02:00</div>
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
          <div className="hud-label">現在の問題</div>
          <div className="hud-value">{Math.min(problemIndex + 1, problems.length)} / {problems.length}</div>
        </div>
      </div>

      {currentProblem && (
        <>
          <div className="code-block-source">
            <span>📦 {repoInfo.owner}/{repoInfo.name} · {currentProblem.function_name}</span>
            <a href={currentProblem.source_url} rel="noreferrer noopener" target="_blank">
              GitHub で見る ↗
            </a>
          </div>
          <pre className="code-block">
            {renderCode(currentProblem.code_block, cursor)}
          </pre>
        </>
      )}

      <div className="replay-controls">
        <button className="btn" onClick={togglePause} type="button">
          {paused ? "▶" : "⏸"}
        </button>
        <button className="btn" onClick={() => jumpTo(0)} type="button" title="先頭">⏮</button>
        <button className="btn" onClick={() => jumpTo(SESSION_MS)} type="button" title="末尾">⏭</button>
        <div
          className="progress"
          onClick={handleProgressClick}
          style={{ cursor: "pointer", position: "relative" }}
        >
          <div
            className="progress-fill"
            style={{ background: "var(--purple)", width: `${progressPct}%` }}
          />
        </div>
        <span className="text-mono text-sm text-muted">{elapsedSec}s / 120s</span>
        <div className="speed-pills">
          {SPEEDS.map((s) => (
            <button
              className={`speed-pill ${speed === s ? "active" : ""}`}
              key={s}
              onClick={() => changeSpeed(s)}
              type="button"
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="row gap-16 mt-16">
        <div className="col">
          <div className="card">
            <div className="card-header">
              <div className="card-title">出題シーケンス ({problems.length} 問)</div>
            </div>
            <div className="text-sm" style={{ display: "grid", gap: "6px" }}>
              {problems.map((p, i) => {
                const isCurrent = i === problemIndex
                const isDone = i < problemIndex
                return (
                  <div
                    className="flex-between"
                    key={p.id}
                    style={isCurrent ? { background: "rgba(88,166,255,0.08)", borderRadius: "4px", padding: "4px 6px" } : undefined}
                  >
                    <span>
                      {i + 1}. <code className="inline">{p.function_name}</code>
                      {isCurrent && <span className="badge accent" style={{ marginLeft: "8px" }}>再生中</span>}
                    </span>
                    <span className={isDone ? "" : "text-muted"}>
                      {isDone ? <span className="badge success">完走</span> : `${p.char_count}c`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="col-sidebar">
          <div className="card">
            <div className="card-header">
              <div className="card-title">📜 ライセンス・出典</div>
            </div>
            <div className="text-sm" style={{ display: "grid", gap: "8px" }}>
              <div>
                <span className="text-muted">repo:</span>{" "}
                <a href={`https://github.com/${repoInfo.owner}/${repoInfo.name}`} rel="noreferrer noopener" target="_blank">
                  {repoInfo.owner}/{repoInfo.name}
                </a>
              </div>
              <div>
                <span className="text-muted">license:</span>{" "}
                <span className="text-mono">{repoInfo.license}</span>
              </div>
              {repoInfo.description && (
                <div className="text-muted text-sm">{repoInfo.description}</div>
              )}
              {repoInfo.topics.length > 0 && (
                <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                  {repoInfo.topics.slice(0, 6).map((topic) => (
                    <span className="badge" key={topic}>#{topic}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

const LANGUAGE_LABEL: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
}

const renderCode = (code: string, cursorPos: number) => {
  return (
    <>
      <span className="typed">{code.slice(0, cursorPos)}</span>
      <span className="current">{code[cursorPos] ?? ""}</span>
      <span className="untyped">{code.slice(cursorPos + 1)}</span>
    </>
  )
}

const formatMs = (sec: number): string => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0")
  const s = (sec % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

const PlayerAvatar = ({ avatarUrl, githubUsername }: { avatarUrl: string | null; githubUsername: string }) => {
  const initials = githubUsername.slice(0, 2).toUpperCase()
  if (avatarUrl === null) {
    return <span className="avatar lg">{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={githubUsername} className="avatar lg" src={avatarUrl} />
  )
}
