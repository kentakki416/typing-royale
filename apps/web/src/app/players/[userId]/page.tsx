import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import type { GetPlayerResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { gradeBadgeClass } from "@/libs/grade"

type Params = { userId: string }

/**
 * /api/players/:userId を叩いて GetPlayerResponse または null（404 / 不正な id）を返す
 * その他のエラーは throw（Next.js の error boundary で扱う）
 */
const fetchPlayer = async (userId: string): Promise<GetPlayerResponse | null> => {
  const numeric = Number(userId)
  if (!Number.isInteger(numeric) || numeric <= 0) return null
  try {
    return await apiClient.get<GetPlayerResponse>(`/api/players/${numeric}`)
  } catch (err) {
    /**
     * apiClient は `API error: 404` の形で throw するので 404 だけ null にフォールバック。
     * その他のステータス（5xx 等）は throw を維持
     */
    if (err instanceof Error && err.message.includes("404")) return null
    throw err
  }
}

export const generateMetadata = async ({ params }: { params: Promise<Params> }): Promise<Metadata> => {
  const { userId } = await params
  const player = await fetchPlayer(userId)
  if (player === null) {
    return { title: "プレイヤーが見つかりません - Typing Royale" }
  }
  const tsBest = player.language_bests.find((b) => b.language.slug === "typescript")
  return {
    description: `グレード: ${player.lifetime_stats.current_grade.name} · ベストスコア: ${player.lifetime_stats.best_score} pts${tsBest ? ` · TS 全期間 #${tsBest.rank}` : ""}`,
    title: `@${player.user.display_name} - Typing Royale`,
  }
}

/**
 * プレイヤー詳細ページ（mock: player-detail.html 準拠）
 *
 * 表示要素:
 * - ヘッダーカード（アバター / 表示名 / 参加日 / 連続日数 / グレード + ランキングバッジ）
 * - 4-stat (TS ベスト / JS ベスト / 累計文字数 / 総プレイ数)
 * - 言語別ベスト一覧
 * - スコア推移 / 獲得特典 は別フェーズ用 placeholder
 *
 * 404 → notFound() で /players/[userId]/not-found.tsx を表示
 */
export default async function PlayerDetailPage({ params }: { params: Promise<Params> }) {
  const { userId } = await params
  const player = await fetchPlayer(userId)
  if (player === null) notFound()

  const initials = player.user.display_name.slice(0, 2).toUpperCase()
  const grade = player.lifetime_stats.current_grade
  const tsBest = player.language_bests.find((b) => b.language.slug === "typescript")
  const jsBest = player.language_bests.find((b) => b.language.slug === "javascript")
  const joinedYmd = new Date(player.user.joined_at).toISOString().slice(0, 10)
  const reachedYmd = player.lifetime_stats.current_grade_reached_at === null
    ? null
    : new Date(player.lifetime_stats.current_grade_reached_at).toISOString().slice(0, 10)

  return (
    <>
      <Topbar active="ranking" />

      <div className="container">
        <div className="text-sm text-muted mb-8">
          <Link href="/ranking">← ランキング</Link>
        </div>

        <div className="card mb-24">
          <div className="flex gap-16" style={{ alignItems: "center" }}>
            {player.user.avatar_url === null ? (
              <span className="avatar lg" style={{ fontSize: "28px", height: "96px", width: "96px" }}>
                {initials}
              </span>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                alt={player.user.display_name}
                className="avatar lg"
                src={player.user.avatar_url}
                style={{ height: "96px", width: "96px" }}
              />
            )}

            <div style={{ flex: 1 }}>
              <h1 style={{ marginBottom: "4px" }}>@{player.user.display_name}</h1>
              <div className="text-muted mb-8">
                参加: {joinedYmd} · 連続{" "}
                <strong style={{ color: "var(--success)" }}>
                  {player.lifetime_stats.streak_days} 日
                </strong>
              </div>
              <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                <span className={`badge-grade ${gradeBadgeClass(grade.name)}`} data-level={grade.level}>
                  {grade.name}
                </span>
                {tsBest && tsBest.rank === 1 && <span className="badge accent">TS 全期間 #1</span>}
                {jsBest && jsBest.rank === 1 && <span className="badge warning">JS 全期間 #1</span>}
                {reachedYmd !== null && (
                  <span className="text-sm text-muted">{reachedYmd} 達成</span>
                )}
              </div>
            </div>

            <div>
              <Link className="btn btn-gold" href="/play">⚡ 自分も挑戦する</Link>
            </div>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-value accent">{tsBest?.score?.toLocaleString() ?? "—"}</div>
            <div className="stat-label">TS ベスト</div>
          </div>
          <div className="stat">
            <div className="stat-value">{jsBest?.score?.toLocaleString() ?? "—"}</div>
            <div className="stat-label">JS ベスト</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {player.lifetime_stats.total_typed_chars.toLocaleString()}
            </div>
            <div className="stat-label">累計文字数</div>
          </div>
          <div className="stat">
            <div className="stat-value success">{player.lifetime_stats.total_sessions}</div>
            <div className="stat-label">総プレイ数</div>
          </div>
        </div>

        <div className="row">
          <div className="col">
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">📊 言語別ベスト</div>
              </div>
              {player.language_bests.length === 0 ? (
                <p className="text-sm text-muted text-center" style={{ padding: "24px 0" }}>
                  まだプレイ履歴がありません
                </p>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {player.language_bests.map((b) => (
                    <div
                      className="card"
                      key={b.language.id}
                      style={{
                        alignItems: "center",
                        background: "var(--bg-surface-2)",
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                      }}
                    >
                      <div>
                        <div className="text-mono">
                          {b.language.name} · 全期間 #{b.rank}
                        </div>
                        <div className="text-sm text-muted">
                          {b.score} pts · {b.typed_chars} 文字 · {(b.accuracy * 100).toFixed(1)}%
                        </div>
                      </div>
                      <span className="badge accent">ベスト</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">📈 スコア推移</div>
              </div>
              <p className="text-sm text-muted text-center" style={{ padding: "24px 0" }}>
                スコア推移グラフはプレイ履歴 API（別 step）で実装します
              </p>
            </div>
          </div>

          <aside className="col-sidebar">
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">🏆 獲得した特典</div>
              </div>
              <p className="text-sm text-muted">
                特典は Rewards 機能で実装します。
              </p>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">🌐 リンク</div>
              </div>
              <p className="text-sm text-muted">
                外部リンクは別 step で対応します。
              </p>
            </div>
          </aside>
        </div>
      </div>

      <div className="footer">
        <Link href="/ranking">← ランキングに戻る</Link>
      </div>
    </>
  )
}
