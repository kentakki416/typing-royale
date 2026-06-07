import type { Metadata } from "next"
import Link from "next/link"

import { GetUserResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"

export const metadata: Metadata = {
  title: "マイページ - Typing Royale",
}

/**
 * マイページ > ホーム（mock: mypage.html 準拠）
 *
 * Phase 1 ではユーザー情報のみ表示。グレード・ベストスコア・ランキング順位・
 * 累計打鍵数 / 連続日数 / プレイ履歴は Phase 4 (score-ranking) で
 * lifetime-stats API が出来てから本表示。本 step では Coming Soon ラベル付き
 * placeholder を mock 構造に沿って配置する
 */
export default async function MyPage() {
  const me = await apiClient.get<GetUserResponse>("/api/user")
  const initials = (me.display_name ?? "??").slice(0, 2).toUpperCase()

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
            <span className="badge-grade intern" data-level={1}>Intern</span>
            <span className="text-sm text-muted" style={{ marginLeft: "8px" }}>(Coming Soon)</span>
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
                <div className="stat-value accent">—</div>
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

            <div className="card mb-16" style={{ borderColor: "rgba(189, 147, 249, 0.3)" }}>
              <div className="card-header">
                <div className="card-title">⚡ エンジニアグレード進捗</div>
                <span className="badge-grade intern" data-level={1}>Intern</span>
              </div>
              <p className="text-sm text-muted">
                Phase 4 (score-ranking) でベストスコア + lifetime-stats API が出来たら本表示します。
              </p>
            </div>

            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">📈 全期間ランキング</div>
              </div>
              <p className="text-sm text-muted">
                ランキングは Phase 4 で本表示します。
              </p>
            </div>

            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">📜 最近のプレイ</div>
              </div>
              <p className="text-sm text-muted">プレイ履歴は Phase 4 で本表示します。</p>
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
