import type { Metadata } from "next"
import Link from "next/link"

import { GetMyRankingResponse, GetUserResponse } from "@repo/api-schema"

import { GradeProgressBar } from "@/components/grade-progress-bar"
import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { gradeBadgeClass } from "@/libs/grade"

export const metadata: Metadata = {
  title: "マイページ - Typing Royale",
}

/**
 * マイページ > ホーム（mock: mypage.html 準拠）
 *
 * 表示要素:
 * - アバター + 表示名 + ランキング掲載 ON/OFF + 全言語通算グレード badge
 * - 4-stat (ベストスコア / 累計文字数 / 総プレイ数 / 平均正確率)
 *     ※ 累計文字数 / 総プレイ数 / 平均正確率 は /api/users/me 拡張までプレースホルダ
 * - エンジニアグレード進捗カード（全言語通算 bestScore ベース）
 * - 全期間ランキング表（TS / JS 別ベスト + 順位 + 状態）
 * - 最近のプレイは別 step
 */
export default async function MyPage() {
  const [me, tsRanking, jsRanking] = await Promise.all([
    apiClient.get<GetUserResponse>("/api/user"),
    apiClient.get<GetMyRankingResponse>("/api/rankings/me?language=typescript").catch(() => null),
    apiClient.get<GetMyRankingResponse>("/api/rankings/me?language=javascript").catch(() => null),
  ])

  const initials = (me.display_name ?? "??").slice(0, 2).toUpperCase()
  /** グレードは全言語通算で同じなので TS / JS どちらかから取り出す（両方 null なら null）*/
  const grade = tsRanking?.grade ?? jsRanking?.grade ?? null
  const nextGrade = tsRanking?.next_grade ?? jsRanking?.next_grade ?? null
  const bestScore = Math.max(tsRanking?.best_score ?? 0, jsRanking?.best_score ?? 0)

  return (
    <>
      <Topbar />

      <div className="container">
        <div className="flex gap-16 mb-24" style={{ alignItems: "center" }}>
          <span className="avatar lg">{initials}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ marginBottom: "4px" }}>{me.display_name ?? "(no name)"}</h1>
            <div className="text-muted text-sm mb-8">
              ランキング掲載: <strong style={{ color: me.can_public_ranking ? "var(--success)" : "var(--text-muted)" }}>
                {me.can_public_ranking ? "ON" : "OFF"}
              </strong>
            </div>
            {grade !== null ? (
              <span className={`badge-grade ${gradeBadgeClass(grade.name)}`} data-level={grade.level}>
                {grade.name}
              </span>
            ) : (
              <>
                <span className="badge-grade intern" data-level={1}>Intern</span>
                <span className="text-sm text-muted" style={{ marginLeft: "8px" }}>(まだプレイ実績がありません)</span>
              </>
            )}
          </div>
          <Link className="btn" href="/mypage/account">⚙ 設定</Link>
        </div>

        <div className="tabs">
          <Link className="tab active" href="/mypage">概要</Link>
          <a className="tab" href="#">特典</a>
          <a className="tab" href="#">プレイ履歴</a>
          <Link className="tab" href="/mypage/account">設定</Link>
        </div>

        <div className="row">
          <div className="col">
            <div className="stat-row">
              <div className="stat">
                <div className="stat-value accent">{bestScore > 0 ? bestScore : "—"}</div>
                <div className="stat-label">ベストスコア</div>
              </div>
              <div className="stat">
                <div className="stat-value">—</div>
                <div className="stat-label">累計文字数</div>
              </div>
              <div className="stat">
                <div className="stat-value">—</div>
                <div className="stat-label">総プレイ数</div>
              </div>
              <div className="stat">
                <div className="stat-value success">—</div>
                <div className="stat-label">平均正確率</div>
              </div>
            </div>

            {grade !== null ? (
              <div className="card mb-16" style={{ borderColor: "rgba(189, 147, 249, 0.3)" }}>
                <div className="card-header">
                  <div className="card-title">⚡ エンジニアグレード進捗</div>
                  <span className={`badge-grade ${gradeBadgeClass(grade.name)}`} data-level={grade.level}>
                    {grade.name}
                  </span>
                </div>
                <div className="text-sm mb-8">
                  <div className="flex-between mb-8">
                    <span className="text-muted">現在のベストスコア（全言語通算）</span>
                    <span className="text-mono">{bestScore} pts</span>
                  </div>
                  {nextGrade !== null && (
                    <div className="flex-between">
                      <span className="text-muted">
                        次の <strong style={{ color: "var(--gold-light)" }}>{nextGrade.name}</strong> まで
                      </span>
                      <span className="text-mono" style={{ color: "var(--gold)" }}>
                        あと {nextGrade.score_needed} pts
                      </span>
                    </div>
                  )}
                </div>
                <GradeProgressBar bestScore={bestScore} nextGrade={nextGrade} />
              </div>
            ) : (
              <div className="card mb-16" style={{ borderColor: "rgba(189, 147, 249, 0.3)" }}>
                <div className="card-header">
                  <div className="card-title">⚡ エンジニアグレード進捗</div>
                  <span className="badge-grade intern" data-level={1}>Intern</span>
                </div>
                <p className="text-sm text-muted">
                  1 セッションプレイすると、ベストスコアとグレード進捗が表示されます。
                </p>
              </div>
            )}

            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">📈 全期間ランキング</div>
                <Link className="text-sm" href="/ranking">ランキング全体 →</Link>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>言語</th>
                    <th className="numeric">ベスト</th>
                    <th className="numeric">順位</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  <RankingRow badge="accent" label="TypeScript" ranking={tsRanking} />
                  <RankingRow badge="warning" label="JavaScript" ranking={jsRanking} />
                </tbody>
              </table>
            </div>

            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">📜 最近のプレイ</div>
              </div>
              <p className="text-sm text-muted">プレイ履歴は別 step で実装します。</p>
            </div>
          </div>

          <aside className="col-sidebar">
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">🏷 README バッジ</div>
              </div>
              <p className="text-sm text-muted">バッジは Phase 7 (rewards) で本表示します。</p>
            </div>

            <div className="card mb-16">
              <div className="card-header"><div className="card-title">🎁 特典</div></div>
              <p className="text-sm text-muted">特典は Phase 7 で本表示します。</p>
            </div>
          </aside>
        </div>
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a>
      </div>
    </>
  )
}

/**
 * 全期間ランキング表の 1 行
 * 「圏内 / 圏外」境界は UX 都合で 1000 位（リアルタイム集計でも閾値表記は残す）
 */
const RankingRow = ({ badge, label, ranking }: {
    badge: "accent" | "warning"
    label: string
    ranking: GetMyRankingResponse | null
}) => {
  if (ranking === null || ranking.rank === null || ranking.best_score === null) {
    return (
      <tr>
        <td><span className={`badge ${badge}`}>{label}</span></td>
        <td className="numeric text-muted">—</td>
        <td className="numeric text-muted">—</td>
        <td><span className="badge">未プレイ</span></td>
      </tr>
    )
  }
  const inRange = ranking.rank <= 1000
  return (
    <tr>
      <td><span className={`badge ${badge}`}>{label}</span></td>
      <td className="numeric"><strong>{ranking.best_score}</strong></td>
      <td className="numeric">
        <strong style={{ color: "var(--accent)" }}>#{ranking.rank}</strong>
      </td>
      <td>
        <span className={`badge ${inRange ? "success" : "warning"}`}>
          {inRange ? "圏内" : "圏外（1000位以下）"}
        </span>
      </td>
    </tr>
  )
}
