"use client"

import { useEffect, useState } from "react"

import type { GetMyRewardsResponse, PendingReward } from "@repo/api-schema"

const STORAGE_KEY = "pendingRewards"
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 10
const STORAGE_TTL_MS = 60_000

type StoredPendingRewards = {
    items: PendingReward[]
    startedAt: number
}

type CompletedReward = GetMyRewardsResponse["rewards"][number]

/**
 * sessionStorage に保存された pending_rewards を読み出して polling し、
 * 全ての reward が生成完了したらポップアップで SVG + PNG プレビュー + DL ボタンを
 * 表示する。詳細: docs/spec/special-badges/step5-web-home-popup.md
 *
 * - リザルト画面 (`result-screen.tsx`) で `/finish` 完了直後に sessionStorage に
 *   `{ items, startedAt }` を保存し、`POST /api/internal/rewards/generate` を
 *   fire-and-forget で叩く設計
 * - ホーム遷移後にこのコンポーネントが mount され、polling で完了をキャッチ
 * - 1 分以上経過していたら諦める (古い state を見ない)
 */
export function PendingRewardsPopup() {
  const [completed, setCompleted] = useState<CompletedReward[] | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw === null) return
    let parsed: StoredPendingRewards
    try {
      parsed = JSON.parse(raw) as StoredPendingRewards
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    if (Date.now() - parsed.startedAt > STORAGE_TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    const itemIds = parsed.items.map((p) => p.reward_id)
    if (itemIds.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }

    let attempts = 0
    let cancelled = false

    const poll = async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/internal/rewards/me?ids=${itemIds.join(",")}`)
        if (!res.ok) throw new Error(`status=${res.status}`)
        const data = await res.json() as GetMyRewardsResponse
        const allReady = parsed.items.every((p) => data.rewards.some(
          (r) => r.reward_id === p.reward_id
                    && r.asset_url !== null
                    && r.asset_svg_url !== null,
        ))
        if (cancelled) return
        if (allReady) {
          const matched = data.rewards.filter((r) => itemIds.includes(r.reward_id))
          if (matched.length > 0) setCompleted(matched)
          sessionStorage.removeItem(STORAGE_KEY)
          return
        }
      } catch {
        /** transient エラーは無視して次回 attempt で再試行 */
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        sessionStorage.removeItem(STORAGE_KEY)
        return
      }
      setTimeout(() => { if (!cancelled) void poll() }, POLL_INTERVAL_MS)
    }

    void poll()
    return () => { cancelled = true }
  }, [])

  if (completed === null) return null

  return (
    <PendingRewardsModal
      rewards={completed}
      onClose={() => setCompleted(null)}
    />
  )
}

type ModalProps = {
    rewards: CompletedReward[]
    onClose: () => void
}

function PendingRewardsModal({ onClose, rewards }: ModalProps) {
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
          {rewards.map((r) => <RewardPreview key={r.reward_id} reward={r} />)}
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

function RewardPreview({ reward }: { reward: CompletedReward }) {
  if (reward.asset_url === null || reward.asset_svg_url === null) return null
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(reward.asset_svg_url)}`
  return (
    <article style={{ borderBottom: "1px solid #374151", paddingBottom: 16 }}>
      <img
        alt={`${reward.type} 達成カード`}
        src={reward.asset_url}
        style={{ borderRadius: 8, display: "block", marginBottom: 12, maxWidth: "100%" }}
      />
      <div
        dangerouslySetInnerHTML={{ __html: reward.asset_svg_url }}
        style={{ marginBottom: 12 }}
      />
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
      </div>
    </article>
  )
}
