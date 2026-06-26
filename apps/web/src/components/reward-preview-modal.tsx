"use client"

import { useState } from "react"

import type { GetMyRewardsResponse } from "@repo/api-schema"

import { downloadFile } from "@/libs/download-file"

export type RewardPreview = GetMyRewardsResponse["rewards"][number]

type Props = {
    /** Express API の origin。相対 asset_url の前に付けてブラウザから画像を取得する */
    apiUrl: string
    onClose: () => void
    rewards: RewardPreview[]
}

/**
 * 獲得済み reward（SVG バッジ + PNG カード）のプレビューモーダル。
 *
 * `PendingRewardsPopup`（リザルト直後の sessionStorage 起点）と
 * `MissedRewardsPopup`（ホーム再訪時の取りこぼし救済）の両方から使う共通 UI。
 * 詳細: docs/spec/rewards-worker/step4-web-ux-and-missed-popup.md
 *
 * 複数 reward を一度に受け取っても **1 件ずつ順番に** 表示する（まとめて並べない）。
 * 「次へ」で次の reward に進み、最後の 1 件で「閉じる」を押すと onClose を呼ぶ。
 */
export function RewardPreviewModal({ apiUrl, onClose, rewards }: Props) {
  /** PNG が未生成の行（asset_url=null）は表示対象外なので除外する */
  const displayable = rewards.filter((r) => r.asset_url !== null)
  const [index, setIndex] = useState(0)

  if (displayable.length === 0) return null

  const current = displayable[index]
  const isLast = index >= displayable.length - 1

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
          /**
           * TopTenAnnouncementModal と同様、周囲を accent カラーで光らせて
           * 「特典獲得」の祝福感を出す
           */
          border: "1px solid rgba(255, 213, 74, 0.6)",
          borderRadius: 12,
          boxShadow: "0 0 40px -6px rgba(255, 213, 74, 0.55), 0 0 90px -20px rgba(255, 213, 74, 0.4), 0 24px 80px -32px rgba(0,0,0,0.7)",
          color: "#fff",
          maxHeight: "85vh",
          maxWidth: 720,
          overflowY: "auto",
          padding: 32,
          width: "90%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>
            🎉 新しい特典を獲得しました
          </h2>
          {displayable.length > 1 && (
            <span style={{ color: "#9ca3af", fontSize: 14 }}>
              {index + 1} / {displayable.length}
            </span>
          )}
        </div>
        {/** key で reward 切り替え時に img / SVG を確実に再マウントする */}
        <RewardCard apiUrl={apiUrl} key={current.reward_id} reward={current} />
        <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 16 }}>
          特典は<strong style={{ color: "#fff" }}>マイページ</strong>からいつでも取得できます。
        </p>
        <button
          onClick={() => {
            if (isLast) {
              onClose()
            } else {
              setIndex((i) => i + 1)
            }
          }}
          style={{
            background: isLast ? "#374151" : "#2563eb",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            marginTop: 24,
            padding: "10px 24px",
          }}
          type="button"
        >
          {isLast ? "閉じる" : "次へ →"}
        </button>
      </div>
    </div>
  )
}

/**
 * reward 1 件分のプレビュー。PNG は必須、SVG バッジは grade_up のように持たない type も
 * あるため null の場合はスキップする（rewards-worker step3 で grade_up も対象になった）
 */
function RewardCard({ apiUrl, reward }: { apiUrl: string; reward: RewardPreview }) {
  if (reward.asset_url === null) return null
  /**
   * asset_url は相対パス (例: /cache/rewards/..) で保存されるため、ブラウザから取得できるよう
   * API origin を前置する (既に絶対 URL ならそのまま使う)。mypage/rewards と同じ方針。
   */
  const fullAssetUrl = reward.asset_url.startsWith("http")
    ? reward.asset_url
    : `${apiUrl}${reward.asset_url}`
  const svg = reward.asset_svg_url
  const svgDataUrl = svg === null
    ? null
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return (
    <article>
      <img
        alt={`${reward.type} 達成カード`}
        src={fullAssetUrl}
        style={{ borderRadius: 8, display: "block", marginBottom: 12, maxWidth: "100%" }}
      />
      {svg !== null && (
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ marginBottom: 12 }}
        />
      )}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={() => {
            void downloadFile(fullAssetUrl, `reward-${reward.reward_id}.png`).catch(() => {
              /** CORS 未反映等で失敗したら画像を別タブで開くフォールバック */
              window.open(fullAssetUrl, "_blank", "noopener,noreferrer")
            })
          }}
          style={{
            background: "#2563eb",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            padding: "8px 16px",
          }}
          type="button"
        >
          PNG をダウンロード
        </button>
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
