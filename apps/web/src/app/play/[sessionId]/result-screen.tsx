"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { FinishPlaySessionResponse, GetMyRankingResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { CelebrationOverlay } from "@/components/celebration-overlay"
import { GradeProgressBar } from "@/components/grade-progress-bar"
import { ResultSummaryPopup } from "@/components/result-summary-popup"
import { TopTenCommentModal } from "@/components/top-ten-comment-modal"
import { Topbar } from "@/components/topbar"
import { gradeBadgeClass } from "@/libs/grade"

import { GhostResultModal } from "./ghost-result-modal"
import type { GhostSummary, GhostUserDisplay } from "./types"

type Props = {
  /**
   * 神々モードの神サマリ（PlayLoop から渡される）
   */
  ghostSummary: GhostSummary | null
  /**
   * 神々モードの神情報（sessionStorage 復元）
   */
  ghostUserDisplay: GhostUserDisplay | null
  mode: "challenge_gods" | "solo"
  problems: StartSoloPlaySessionResponse["problems"]
  repoInfo: StartSoloPlaySessionResponse["repo_info"]
  /**
   * /finish のレスポンス。通信失敗時は null
   */
  result: FinishPlaySessionResponse | null
}

/**
 * リザルト画面（mock: result.html 準拠）
 *
 * 表示要素:
 * - SESSION COMPLETE + スコア + 言語・モード・グレード badge + ベスト更新バッジ
 * - 3 stat (累計文字数 / 正確率 / 出題数)
 * - 全期間ランキング: /finish の new_rank をリアルタイム表示
 * - エンジニアグレード: 全言語通算 bestScore + 次グレードまでの進捗バー
 * - グレードアップ祝賀バナー（grade_up !== null）
 * - TOP 10 入りバナー（score > top_ten_boundary_score）
 * - よく間違える文字 (mistype top 5)
 * - リポジトリコメント
 * - もう一度プレイ / 言語を変える / シェアボタン
 */
export function ResultScreen({ ghostSummary, ghostUserDisplay, mode, problems, repoInfo, result }: Props) {
  const [me, setMe] = useState<GetMyRankingResponse | null>(null)
  const [meFetchFailed, setMeFetchFailed] = useState(false)
  const [hofModalOpen, setHofModalOpen] = useState(false)
  const [hofPromptDismissed, setHofPromptDismissed] = useState(false)
  /** リザルト到達時に 1 度だけ祝福 overlay を再生 */
  const [showCelebration, setShowCelebration] = useState(true)
  /**
   * 祝福 overlay が終わったら結果サマリーポップアップを 1 度だけ表示。
   * 閉じると裏の詳細 ResultScreen が見える
   */
  const [showSummaryPopup, setShowSummaryPopup] = useState(false)

  /**
   * ゲスト（未ログイン）プレイの判定: /finish の persisted=false がサーバーから返る
   */
  const isGuest = result !== null && !result.persisted

  useEffect(() => {
    if (result === null) return
    /** ゲストは /api/rankings/me が 401 になるためフェッチをスキップ */
    if (isGuest) return
    /** TS 固定でフェッチ（言語選択を引き継ぐ仕組みは後続 step で対応） */
    const loadMyRanking = async () => {
      try {
        const res = await fetch("/api/internal/my-ranking?language=typescript")
        if (!res.ok) {
          setMeFetchFailed(true)
          return
        }
        const data = await res.json() as GetMyRankingResponse
        setMe(data)
      } catch {
        setMeFetchFailed(true)
      }
    }
    void loadMyRanking()
  }, [isGuest, result])

  if (result === null) {
    return (
      <>
        <Topbar isAuthed={false} />
        <div className="container container-narrow mt-24 text-center">
          <h1>結果の保存に失敗しました</h1>
          <p className="text-muted mt-8">通信が不安定だった可能性があります</p>
          <div className="flex gap-12 mt-24" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary" href="/">トップに戻る</Link>
          </div>
        </div>
      </>
    )
  }

  const topMistypes = Object.entries(result.mistype_stats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  /**
   * TOP 10 入り判定はランキングへの掲載が前提なので、ゲストには出さない
   */
  const isTopTenEntry = !isGuest
    && result.top_ten_boundary_score !== null
    && result.score > result.top_ten_boundary_score

  return (
    <>
      <Topbar isAuthed={!isGuest} />

      <div className="container container-narrow">
        <div className="text-center mt-24">
          <div className="text-mono text-muted text-sm">SESSION COMPLETE · 120s</div>
          <h1 className="text-mono" style={{ fontSize: "48px", margin: "8px 0" }}>
            {result.score} <span className="text-muted" style={{ fontSize: "18px" }}>pts</span>
          </h1>
          <div className="flex gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <span className="badge accent">TypeScript</span>
            <span className={`badge ${mode === "challenge_gods" ? "gold" : ""}`}>
              {mode === "challenge_gods" ? "⚡ 神々に挑戦" : "通常モード"}
            </span>
            {me !== null && (
              <span
                className={`badge-grade ${gradeBadgeClass(me.grade.name)}`}
                data-level={me.grade.level}
              >
                {me.grade.name}
              </span>
            )}
            {result.best_score_updated && (
              <span className="badge success">✨ ベスト更新</span>
            )}
          </div>
        </div>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-value accent">{result.typed_chars}</div>
            <div className="stat-label">累計文字数</div>
          </div>
          <div className="stat">
            <div className="stat-value success">{(result.accuracy * 100).toFixed(1)}%</div>
            <div className="stat-label">正確率</div>
          </div>
          <div className="stat">
            <div className="stat-value">{result.problems_played}</div>
            <div className="stat-label">出題数</div>
          </div>
        </div>

        {isTopTenEntry && (
          <>
            <div className="card mb-16" style={{ borderColor: "rgba(255, 213, 74, 0.5)" }}>
              <div className="text-center">
                <strong style={{ color: "var(--gold-light)" }}>🏆 TOP 10 入り見込み！</strong>
                <p className="text-sm text-muted mt-8 mb-16">
                  殿堂入りに掲載されます。記念にコメントを残しませんか？
                </p>
                {hofPromptDismissed ? (
                  <p className="text-sm text-muted">
                    コメントはマイページからいつでも編集できます
                  </p>
                ) : (
                  <div className="flex gap-12" style={{ justifyContent: "center" }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => setHofModalOpen(true)}
                      type="button"
                    >
                      コメントを残す
                    </button>
                    <button
                      className="btn"
                      onClick={() => setHofPromptDismissed(true)}
                      type="button"
                    >
                      あとで書く
                    </button>
                  </div>
                )}
              </div>
            </div>
            <TopTenCommentModal
              language="typescript"
              onClose={() => { setHofModalOpen(false); setHofPromptDismissed(true) }}
              open={hofModalOpen}
            />
          </>
        )}

        {result.grade_up !== null && (
          <div className="card mb-16" style={{ borderColor: "var(--accent)" }}>
            <div className="text-center">
              <strong style={{ color: "var(--accent)" }}>
                🎉 {result.grade_up.from.name} → {result.grade_up.to.name} 昇格！
              </strong>
              <p className="text-sm text-muted mt-8">
                達成カードは Rewards 機能で自動生成されます
              </p>
            </div>
          </div>
        )}

        {isGuest ? (
          <div className="card mb-16" style={{ borderColor: "rgba(125, 211, 252, 0.4)" }}>
            <div className="card-header">
              <div className="card-title">💾 このスコアは保存されていません</div>
            </div>
            <p className="text-sm text-muted mb-16">
              ゲストプレイのため、ランキング・グレード・達成カードには反映されていません。
              GitHub 連携すると次回以降のプレイから記録が残せます。
            </p>
            <div className="flex gap-12" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary btn-large" href="/sign-in">
                GitHub で記録を残す
              </Link>
            </div>
          </div>
        ) : (
          <div className="card mb-16">
            <div className="card-header">
              <div className="card-title">🏆 全期間ランキング</div>
              <Link className="text-sm" href="/ranking">ランキング全体 →</Link>
            </div>
            {result.new_rank !== null ? (
              <>
                <div className="text-center mb-16">
                  <div
                    className="text-mono"
                    style={{ color: "var(--accent)", fontSize: "36px", fontWeight: 700 }}
                  >
                    #{result.new_rank}
                  </div>
                  <div className="text-sm text-muted">
                    TypeScript
                    {me !== null && ` · ${me.total_ranked_players.toLocaleString()} 人中`}
                  </div>
                </div>
                <div className="text-sm text-muted text-center">現在の順位を即時表示</div>
              </>
            ) : (
              <div className="text-sm text-muted text-center">
                {meFetchFailed ? "順位を取得できませんでした" : "順位を計算中..."}
              </div>
            )}
          </div>
        )}

        {me !== null && me.best_score !== null && (
          <div className="card mb-16" style={{ borderColor: "rgba(189, 147, 249, 0.3)" }}>
            <div className="card-header">
              <div className="card-title">⚡ エンジニアグレード</div>
              <span
                className={`badge-grade ${gradeBadgeClass(me.grade.name)}`}
                data-level={me.grade.level}
              >
                {me.grade.name}
              </span>
            </div>
            <div className="text-sm mb-8">
              <div className="flex-between mb-8">
                <span className="text-muted">現在のベストスコア（全言語通算）</span>
                <span className="text-mono">{me.best_score} pts</span>
              </div>
              {me.next_grade !== null && (
                <div className="flex-between">
                  <span className="text-muted">
                    次の <strong style={{ color: "var(--gold-light)" }}>{me.next_grade.name}</strong> まで
                  </span>
                  <span className="text-mono" style={{ color: "var(--gold)" }}>
                    あと {me.next_grade.score_needed} pts
                  </span>
                </div>
              )}
            </div>
            <GradeProgressBar bestScore={me.best_score} nextGrade={me.next_grade} />
          </div>
        )}

        {topMistypes.length > 0 && (
          <div className="card mb-16">
            <div className="card-header">
              <div className="card-title">✗ よく間違える文字</div>
            </div>
            <div className="flex gap-12" style={{ flexWrap: "wrap" }}>
              {topMistypes.map(([char, count]) => (
                <div className="flex-center gap-8" key={char}>
                  <code className="inline" style={{ fontSize: "16px" }}>{char === " " ? "␣" : char}</code>
                  <span className="text-muted text-sm">× {count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card mb-16">
          <div className="card-header">
            <div className="card-title">📦 今回のリポジトリ</div>
          </div>
          <div className="flex-between mb-8">
            <div>
              <strong>{repoInfo.owner}/{repoInfo.name}</strong>
              <div className="text-sm text-muted">★ {repoInfo.stars.toLocaleString()}</div>
            </div>
            {repoInfo.homepage && (
              <a className="text-sm" href={repoInfo.homepage} rel="noreferrer noopener" target="_blank">
                公式サイト ↗
              </a>
            )}
          </div>
          {repoInfo.description && (
            <p className="text-sm text-muted">{repoInfo.description}</p>
          )}
          {repoInfo.topics.length > 0 && (
            <div className="flex gap-8 mt-8" style={{ flexWrap: "wrap" }}>
              {repoInfo.topics.slice(0, 6).map((topic) => (
                <span className="badge" key={topic}>#{topic}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-12 mt-24" style={{ flexWrap: "wrap", justifyContent: "center" }}>
          <Link className="btn btn-primary btn-play btn-large" href="/">
            ▶ もう一度プレイ
          </Link>
          <Link className="btn btn-large" href="/">
            言語を変える
          </Link>
        </div>

        <div className="text-center mt-24">
          <div className="text-sm text-muted mb-8">この結果をシェア</div>
          <div className="flex gap-8" style={{ justifyContent: "center" }}>
            <a
              className="btn"
              href={`https://x.com/intent/post?text=${encodeURIComponent(
                `Typing Royale で ${result.score} pts! (${result.typed_chars} 文字 / 正確率 ${(result.accuracy * 100).toFixed(1)}%)`,
              )}`}
              rel="noreferrer noopener"
              target="_blank"
            >
              𝕏 にポスト
            </a>
          </div>
        </div>
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a>
      </div>

      {mode === "challenge_gods" && ghostSummary !== null && ghostUserDisplay !== null && (
        <GhostResultModal
          ghostSummary={ghostSummary}
          ghostUserDisplay={ghostUserDisplay}
          problems={problems}
          result={result}
        />
      )}

      {showCelebration && (
        <CelebrationOverlay
          onFinished={() => {
            setShowCelebration(false)
            setShowSummaryPopup(true)
          }}
        />
      )}
      {showSummaryPopup && (
        <ResultSummaryPopup
          myRanking={me}
          onClose={() => setShowSummaryPopup(false)}
          result={result}
        />
      )}
    </>
  )
}
