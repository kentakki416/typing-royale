"use client"

import Link from "next/link"
import { useState } from "react"

import type { FinishPlaySessionResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import type { GhostSummary, GhostUserDisplay } from "./types"

type Props = {
  ghostSummary: GhostSummary
  ghostUserDisplay: GhostUserDisplay
  problems: StartSoloPlaySessionResponse["problems"]
  result: FinishPlaySessionResponse
}

/**
 * 神々戦リザルトのモーダル overlay
 *
 * - 勝敗ヘッダー: result.score vs ghostUserDisplay.best_score の比較
 * - あなた vs 神カード: スコア / 文字数 / 正確率
 * - 出題シーケンスの達成状況
 * - race-bar: 文字数進捗
 * - ボタン: もう一度神々に挑戦 / 通常プレイへ / リザルトを見る（モーダルを閉じる）
 */
export function GhostResultModal({ ghostSummary, ghostUserDisplay, problems, result }: Props) {
  const [open, setOpen] = useState(true)
  if (!open) return null

  const ghostScore = ghostUserDisplay.best_score
  const diff = result.score - ghostScore
  const youWin = diff > 0
  const tie = diff === 0
  const heading = youWin ? "勝利" : tie ? "引き分け" : "惜敗"
  const headingColor = youWin ? "var(--success)" : tie ? "var(--accent)" : "var(--error)"
  const emoji = youWin ? "🏆" : tie ? "🤝" : "😢"

  const totalChars = problems.reduce((s, p) => s + p.char_count, 0)
  const youPct = totalChars === 0 ? 0 : Math.min(100, (result.typed_chars / totalChars) * 100)
  const ghostPct = totalChars === 0 ? 0 : Math.min(100, (ghostSummary.typedChars / totalChars) * 100)

  const summarize = (): string => {
    if (tie) return `${Math.abs(diff)} pts 互角でした`
    return youWin
      ? `${Math.abs(diff)} pts 差で勝利しました`
      : `${Math.abs(diff)} pts 差で負けました`
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" style={{ position: "relative" }}>
        <button className="modal-close" onClick={() => setOpen(false)} type="button">×</button>

        <div className="text-center mb-24">
          <div style={{ fontSize: "56px" }}>{emoji}</div>
          <h2 style={{ color: headingColor }}>{heading}</h2>
          <p className="modal-sub">
            <span style={{ color: "var(--gold)", fontWeight: 700 }}>
              神 {ghostUserDisplay.github_username}
            </span>
            {" "}に <strong>{summarize()}</strong>
          </p>
        </div>

        <div className="row mb-16" style={{ gap: "12px" }}>
          <div className="card" style={{ flex: 1, padding: "16px" }}>
            <div className="text-sm text-muted mb-8 text-center">あなた</div>
            <div className="text-center">
              <div className="stat-value accent">{result.score}</div>
              <div className="text-sm text-muted">
                {result.typed_chars} 文字 · {(result.accuracy * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="card" style={{ borderColor: "var(--ghost)", flex: 1, padding: "16px" }}>
            <div className="text-sm text-muted mb-8 text-center">⚡ 神</div>
            <div className="text-center">
              <div className="stat-value" style={{ color: "var(--ghost)" }}>{ghostScore}</div>
              <div className="text-sm text-muted">
                {ghostSummary.typedChars} 文字 · {(ghostSummary.accuracy * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        <h3 className="mb-8">出題シーケンスの達成状況（神と同じ順）</h3>
        <div className="text-sm mb-16" style={{ display: "grid", gap: "6px" }}>
          {problems.map((p, i) => {
            const youDone = i < result.problems_completed
            const ghostDone = ghostSummary.perProblem[i]?.completed === true
              || i < ghostSummary.problemIndex
            return (
              <div className="flex-between" key={p.id}>
                <span>{`${i + 1}. ${p.function_name}`}</span>
                <span>
                  <span className={`badge ${youDone ? "success" : "warning"}`}>
                    あなた:{youDone ? "完走" : "未完走"}
                  </span>
                  {" "}
                  <span className="badge gold">神:{ghostDone ? "完走" : "未完走"}</span>
                </span>
              </div>
            )
          })}
        </div>

        <div className="race">
          <div className="race-row">
            <div className="race-label"><span className="race-dot" />あなた</div>
            <div className="race-bar">
              <div className="race-bar-fill" style={{ width: `${youPct}%` }} />
            </div>
            <div className="race-percent">{result.typed_chars}</div>
          </div>
          <div className="race-row">
            <div className="race-label"><span className="race-dot ghost" />神</div>
            <div className="race-bar">
              <div className="race-bar-fill ghost" style={{ width: `${ghostPct}%` }} />
            </div>
            <div className="race-percent">{ghostSummary.typedChars}</div>
          </div>
        </div>

        <div className="text-sm text-muted text-center mt-16">
          ⚡ 次の神もランダム抽選。指名はできません。
        </div>

        <div className="modal-actions">
          <Link className="btn btn-gold" href="/">⚡ もう一度神々に挑戦</Link>
          <Link className="btn" href="/">▶ 通常プレイへ</Link>
          <button className="btn btn-primary" onClick={() => setOpen(false)} type="button">
            リザルトを見る
          </button>
        </div>
      </div>
    </div>
  )
}
