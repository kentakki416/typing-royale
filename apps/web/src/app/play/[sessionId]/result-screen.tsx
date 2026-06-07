"use client"

import Link from "next/link"

import { FinishPlaySessionResponse, StartSoloPlaySessionResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { computeGradeProgress, gradeBadgeClass } from "@/libs/grade"

type Props = {
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
 * - SESSION COMPLETE + スコア + 言語・モード・グレード badge
 * - 4 stat (累計文字数 / 正確率 / 完走関数数 / 出題数)
 * - ランキング placeholder（GET /api/rankings/me は score-ranking 機能で実装予定）
 * - エンジニアグレード（現在ベストスコアと次グレードまでの進捗バー）
 * - よく間違える文字 (mistype top 5)
 * - リポジトリコメント
 * - もう一度プレイ / 言語を変える / シェアボタン
 */
export function ResultScreen({ repoInfo, result }: Props) {
  if (result === null) {
    return (
      <>
        <Topbar />
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

  const grade = computeGradeProgress(result.score)
  const topMistypes = Object.entries(result.mistype_stats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  return (
    <>
      <Topbar />

      <div className="container container-narrow">
        <div className="text-center mt-24">
          <div className="text-mono text-muted text-sm">SESSION COMPLETE · 120s</div>
          <h1 className="text-mono" style={{ fontSize: "48px", margin: "8px 0" }}>
            {result.score} <span className="text-muted" style={{ fontSize: "18px" }}>pts</span>
          </h1>
          <div className="flex gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <span className="badge accent">TypeScript</span>
            <span className="badge">通常モード</span>
            <span className={`badge-grade ${gradeBadgeClass(grade.current.name)}`} data-level={grade.current.level}>
              {grade.current.name}
            </span>
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
            <div className="stat-value">{result.problems_completed}</div>
            <div className="stat-label">完走関数数</div>
          </div>
          <div className="stat">
            <div className="stat-value">{result.problems_played}</div>
            <div className="stat-label">出題数</div>
          </div>
        </div>

        <div className="card mb-16">
          <div className="card-header">
            <div className="card-title">🏆 全期間ランキング</div>
          </div>
          <div className="text-center mb-16">
            <div className="text-mono text-muted" style={{ fontSize: "18px" }}>
              順位は集計後に表示されます
            </div>
          </div>
          <div className="text-sm text-muted text-center">
            次回バッチ集計時に確定します
          </div>
        </div>

        <div className="card mb-16" style={{ borderColor: "rgba(189, 147, 249, 0.3)" }}>
          <div className="card-header">
            <div className="card-title">⚡ エンジニアグレード</div>
            <span className={`badge-grade ${gradeBadgeClass(grade.current.name)}`} data-level={grade.current.level}>
              {grade.current.name}
            </span>
          </div>
          <div className="text-sm mb-8">
            <div className="flex-between mb-8">
              <span className="text-muted">今回のスコア</span>
              <span className="text-mono">{result.score} pts</span>
            </div>
            {grade.next && grade.pointsToNext !== null && (
              <div className="flex-between">
                <span className="text-muted">
                  次の <strong style={{ color: "var(--gold-light)" }}>{grade.next.name}</strong> まで
                </span>
                <span className="text-mono" style={{ color: "var(--gold)" }}>
                  あと {grade.pointsToNext} pts
                </span>
              </div>
            )}
          </div>
          <div className="progress mb-8">
            <div
              className="progress-fill"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, transparent 45%, rgba(0,0,0,0.15) 100%), linear-gradient(180deg, #d8b9ff 0%, #9659e8 100%)",
                width: `${(grade.progress * 100).toFixed(1)}%`,
              }}
            />
          </div>
          {grade.next && (
            <div className="text-sm text-muted text-center">
              {grade.current.threshold} → {result.score} →{" "}
              <strong style={{ color: "var(--gold-light)" }}>
                {grade.next.threshold} ({grade.next.name})
              </strong>
            </div>
          )}
        </div>

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
    </>
  )
}
