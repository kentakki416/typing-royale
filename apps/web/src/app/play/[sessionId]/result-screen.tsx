"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { FinishPlaySessionResponse, GetMyRankingResponse, LanguageItem, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { CelebrationOverlay } from "@/components/celebration-overlay"
import { GradeProgressBar } from "@/components/grade-progress-bar"
import { TopTenAnnouncementModal, TopTenAnnouncementKind } from "@/components/top-ten-announcement-modal"
import { Topbar } from "@/components/topbar"
import { extractRepoAndPathFromGithubUrl } from "@/libs/github-source-url"
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
  /**
   * プレイ言語。言語バッジ表示と /api/internal/my-ranking のクエリに使う（未解決時 null）
   */
  language: LanguageItem | null
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
export function ResultScreen({ ghostSummary, ghostUserDisplay, language, mode, problems, repoInfo, result }: Props) {
  const [me, setMe] = useState<GetMyRankingResponse | null>(null)
  /** リザルト到達時に 1 度だけ祝福 overlay を再生 */
  const [showCelebration, setShowCelebration] = useState(true)
  /**
   * TOP 10 入賞お知らせのキュー
   * 殿堂入り → 月間 の順に push し、先頭から順に表示する。
   * `result` は ResultScreen マウント時点で確定済みなので lazy init で 1 度だけ計算する
   * (詳細: docs/spec/result-top-ten-popup/README.md)
   */
  const [announcementQueue, setAnnouncementQueue] = useState<TopTenAnnouncementKind[]>(() => {
    if (result === null || !result.persisted) return []
    const queue: TopTenAnnouncementKind[] = []
    /**
     * 殿堂入り (全期間 TOP 10) 入賞判定:
     * - boundary===null は user_language_best が 10 件未満 = 誰でも入賞
     * - findTenthScore は自分の今回ベスト upsert 後の 10 位を返すので、
     *   自分が 10 位入りの場合 score === boundary が成立。`>=` で判定する
     */
    if (result.top_ten_boundary_score === null
        || result.score >= result.top_ten_boundary_score) {
      queue.push("all-time")
    }
    if (result.monthly_top_ten_boundary_score === null
        || result.score >= result.monthly_top_ten_boundary_score) {
      queue.push("monthly")
    }
    return queue
  })

  /**
   * TOP 10 入賞ポップアップを少し遅らせて表示する。
   *
   * 理由: /finish 完了後にリザルト画面と同時に popup が pop-in すると、
   * ユーザーがスコアや順位を視認する前にモーダルが覆ってしまい体験が雑に感じる。
   * リザルト画面のスコア / 祝福 overlay が落ち着いた後 (~1.6s 後) に popup を
   * フェード + scale-in で表示する
   */
  const [popupReady, setPopupReady] = useState(false)
  useEffect(() => {
    if (announcementQueue.length === 0) return
    const timer = setTimeout(() => setPopupReady(true), 1600)
    return () => clearTimeout(timer)
  }, [announcementQueue.length])

  /**
   * ゲスト（未ログイン）プレイの判定: /finish の persisted=false がサーバーから返る
   */
  const isGuest = result !== null && !result.persisted

  useEffect(() => {
    if (result === null) return
    /** ゲストは /api/rankings/me が 401 になるためフェッチをスキップ */
    if (isGuest) return
    /** 言語マスタ未解決時はグレード進捗の取得をスキップ（誤った言語で引かない） */
    if (language === null) return
    /**
     * プレイした言語の slug でフェッチする。me は GradeProgressBar のグレード進捗
     * 表示に使う補助情報で、取得失敗時は単に未表示。リザルト全体の体験には影響しない
     */
    const loadMyRanking = async () => {
      try {
        const res = await fetch(`/api/internal/my-ranking?language=${encodeURIComponent(language.slug)}`)
        if (!res.ok) return
        const data = await res.json() as GetMyRankingResponse
        setMe(data)
      } catch {
        /** 補助情報のためサイレントに非表示 */
      }
    }
    void loadMyRanking()
  }, [isGuest, language, result])

  /**
   * rewards-worker (step3): /finish レスポンスに pending_rewards があれば
   * sessionStorage に保存する。画像生成は /finish が enqueue した apps/worker が行うため、
   * クライアントから生成 API を叩く必要はない (旧 POST /api/rewards/generate は廃止)。
   * 生成完了は次のホーム遷移時に PendingRewardsPopup が polling で検知してポップアップを出す
   */
  useEffect(() => {
    if (result === null || !result.persisted) return
    const pending = result.pending_rewards
    if (pending.length === 0) return

    sessionStorage.setItem(
      "pendingRewards",
      JSON.stringify({ items: pending, startedAt: Date.now() }),
    )
  }, [result])

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
   * 今回解いた問題（出題順に完了数ぶん）。各問題の source_url から OSS のファイルパスを出す
   */
  const solvedProblems = [...problems]
    .sort((a, b) => a.order_index - b.order_index)
    .slice(0, result.problems_played)

  return (
    <>
      <Topbar isAuthed={!isGuest} />

      <div className="container container-narrow">
        <div className="text-center mt-24">
          {/**
           * スコアの上に「X 位 / Y 人中」を最初に表示。
           * new_rank と total_ranked_players は /finish のレスポンス（サーバー側で確定済み）
           * から直接受け取るので、追加 fetch やローディング状態は持たない
           */}
          <div
            className="text-mono mb-8"
            style={{ color: "var(--accent)", fontSize: "28px", fontWeight: 700 }}
          >
            {result.new_rank !== null
              ? `${result.new_rank} 位 ／ ${result.total_ranked_players.toLocaleString()} 人中`
              : null}
          </div>
          <h1 className="text-mono" style={{ fontSize: "48px", margin: "8px 0" }}>
            {result.score} <span className="text-muted" style={{ fontSize: "18px" }}>pts</span>
          </h1>
          <div className="flex gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {language !== null && <span className="badge accent">{language.name}</span>}
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

        {/**
         * スコア直下に 3 stat（累計文字数 / 正確率 / 出題数）→ 今回のリポジトリ の順で並べる
         */}
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

        <div className="card mb-16">
          <div className="card-header">
            <div className="card-title"><span style={{ marginRight: "8px" }}>📦</span>今回のリポジトリ</div>
          </div>
          <div className="flex-between mb-8">
            <div>
              <strong>{repoInfo.owner}/{repoInfo.name}</strong>
              <div className="text-sm text-muted">★ {repoInfo.stars.toLocaleString()}（GitHub スター数）</div>
            </div>
            {repoInfo.homepage && (
              <a className="text-sm" href={repoInfo.homepage} rel="noreferrer noopener" target="_blank">
                公式サイト ↗
              </a>
            )}
          </div>
          {repoInfo.description && (
            <p className="text-sm text-muted" style={{ marginTop: "8px" }}>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>リポジトリ概要（GitHub より）:</span>
              <br />
              {repoInfo.description}
            </p>
          )}
        </div>

        {solvedProblems.length > 0 && (
          <div className="card mb-16">
            <div className="card-header">
              <div className="card-title">
                <span style={{ marginRight: "8px" }}>📂</span>今回解いたファイル（{solvedProblems.length}）
              </div>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              {solvedProblems.map((problem, index) => {
                const meta = extractRepoAndPathFromGithubUrl(problem.source_url)
                return (
                  <a
                    className="text-sm flex-between"
                    href={problem.source_url}
                    key={problem.id}
                    rel="noreferrer noopener"
                    style={{ alignItems: "flex-start", gap: "8px" }}
                    target="_blank"
                  >
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      <span className="text-muted">{index + 1}.</span>{" "}
                      {meta !== null ? (
                        <>
                          📦 {meta.repo} / <span className="text-mono">{meta.path}</span>
                          {meta.lineRange !== null && (
                            <span className="text-muted">:{meta.lineRange}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-mono">{problem.function_name}</span>
                      )}
                    </span>
                    <span className="text-muted" style={{ flexShrink: 0 }}>↗</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        <div className="card mb-16">
          <div className="card-header">
            <div className="card-title"><span style={{ marginRight: "8px" }}>❌</span>よく間違える文字</div>
          </div>
          {topMistypes.length > 0 ? (
            <div className="flex gap-12" style={{ flexWrap: "wrap" }}>
              {topMistypes.map(([char, count]) => (
                <div className="flex-center gap-8" key={char}>
                  <code className="inline" style={{ fontSize: "16px" }}>{char === " " ? "␣" : char}</code>
                  <span className="text-muted text-sm">× {count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">今回はミスタイプの記録がありませんでした。</p>
          )}
        </div>

        {/**
         * ゲストには「保存されていません」案内を残す（順位はスコア上に表示済み）
         */}
        {isGuest && (
          <div className="card mb-16" style={{ borderColor: "rgba(125, 211, 252, 0.4)" }}>
            <div className="card-header">
              <div className="card-title"><span style={{ marginRight: "8px" }}>💾</span>このスコアは保存されていません</div>
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

        {me !== null && me.best_score !== null && (
          <div className="card mb-16" style={{ borderColor: "rgba(189, 147, 249, 0.3)" }}>
            <div className="card-header">
              <div className="card-title"><span style={{ marginRight: "8px" }}>⚡</span>エンジニアグレード</div>
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

      {mode === "challenge_gods" && ghostSummary !== null && ghostUserDisplay !== null && (
        <GhostResultModal
          ghostSummary={ghostSummary}
          ghostUserDisplay={ghostUserDisplay}
          problems={problems}
          result={result}
        />
      )}

      {showCelebration && (
        <CelebrationOverlay onFinished={() => setShowCelebration(false)} />
      )}

      {announcementQueue.length > 0 && popupReady && (
        <TopTenAnnouncementModal
          kind={announcementQueue[0]}
          onClose={() => {
            setAnnouncementQueue((prev) => prev.slice(1))
            /** 次の popup が続く場合は再び遅らせて表示する */
            setPopupReady(false)
          }}
          open
        />
      )}
    </>
  )
}

/**
 * タイマー 0 直後、/finish の応答が返るまでの「集計中…」placeholder（rewards-worker step4）。
 *
 * 旧実装はタイマー 0 で /finish を await してから result phase に遷移していたため、
 * 応答待ちの間プレイ画面がフリーズしたように見えた。step3 で /finish が数十〜数百 ms で
 * 返るようになったので、即座にこの placeholder へ遷移して「動いている」感を出す
 */
export function ResultScreenLoading() {
  return (
    <>
      <Topbar isAuthed={false} />
      <div className="container container-narrow mt-24 text-center">
        <div className="result-loading-spinner" />
        <div className="text-mono text-muted mt-16">集計中…</div>
        <p className="text-sm text-muted mt-8">スコアと順位を集計しています</p>
      </div>
    </>
  )
}
