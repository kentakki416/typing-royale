"use client"

import type { GetMyRewardsResponse } from "@repo/api-schema"

export type RewardPreview = GetMyRewardsResponse["rewards"][number]

type Props = {
    onClose: () => void
    rewards: RewardPreview[]
}

/**
 * 獲得済み reward（SVG バッジ + PNG カード）のプレビューモーダル。
 *
 * `PendingRewardsPopup`（リザルト直後の sessionStorage 起点）と
 * `MissedRewardsPopup`（ホーム再訪時の取りこぼし救済）の両方から使う共通 UI。
 * 詳細: docs/spec/rewards-worker/step4-web-ux-and-missed-popup.md
 */
export function RewardPreviewModal({ onClose, rewards }: Props) {
  return (
    <div
      aria-modal="true"
      onClick={onClose}
      role="dialog"
      style={{
        alignItems: "center",
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        height: "100vh",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111827",
          border: "1px solid #374151",
          borderRadius: 12,
          color: "#fff",
          maxHeight: "85vh",
          maxWidth: 720,
          overflowY: "auto",
          padding: 32,
          width: "90%",
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          🎉 新しい特典を獲得しました
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {rewards.map((r) => <RewardCard key={r.reward_id} reward={r} />)}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "#374151",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            marginTop: 24,
            padding: "10px 24px",
          }}
          type="button"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

/**
 * reward 1 件分のプレビュー。PNG は必須、SVG バッジは grade_up のように持たない type も
 * あるため null の場合はスキップする（rewards-worker step3 で grade_up も対象になった）
 */
function RewardCard({ reward }: { reward: RewardPreview }) {
  if (reward.asset_url === null) return null
  const svg = reward.asset_svg_url
  const svgDataUrl = svg === null
    ? null
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return (
    <article style={{ borderBottom: "1px solid #374151", paddingBottom: 16 }}>
      <img
        alt={`${reward.type} 達成カード`}
        src={reward.asset_url}
        style={{ borderRadius: 8, display: "block", marginBottom: 12, maxWidth: "100%" }}
      />
      {svg !== null && (
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ marginBottom: 12 }}
        />
      )}
      <div style={{ display: "flex", gap: 12 }}>
        <a
          download={`reward-${reward.reward_id}.png`}
          href={reward.asset_url}
          style={{
            background: "#2563eb",
            borderRadius: 6,
            color: "#fff",
            padding: "8px 16px",
            textDecoration: "none",
          }}
        >
          PNG をダウンロード
        </a>
        {svgDataUrl !== null && (
          <a
            download={`reward-${reward.reward_id}.svg`}
            href={svgDataUrl}
            style={{
              background: "#0891b2",
              borderRadius: 6,
              color: "#fff",
              padding: "8px 16px",
              textDecoration: "none",
            }}
          >
            SVG をダウンロード
          </a>
        )}
      </div>
    </article>
  )
}
