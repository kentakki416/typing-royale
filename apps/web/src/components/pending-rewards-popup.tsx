"use client"

import { useEffect, useState } from "react"

import type { GetMyRewardsResponse, PendingReward } from "@repo/api-schema"

import { markRewardsSeen } from "@/libs/reward-seen"

import { RewardPreviewModal, type RewardPreview } from "./reward-preview-modal"

const STORAGE_KEY = "pendingRewards"
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 10
const STORAGE_TTL_MS = 60_000

type Props = {
    /** Express API の origin。相対 asset_url の前に付けてブラウザから画像を取得する */
    apiUrl: string
}

type StoredPendingRewards = {
    items: PendingReward[]
    startedAt: number
}

/**
 * sessionStorage に保存された pending_rewards を読み出して polling し、
 * 全ての reward が生成完了（または失敗）したらポップアップで SVG + PNG プレビュー +
 * DL ボタンを表示する。詳細: docs/spec/rewards-worker/step4-web-ux-and-missed-popup.md
 *
 * - リザルト画面 (`result-screen.tsx`) で `/finish` 完了直後に sessionStorage に
 *   `{ items, startedAt }` を保存する設計。画像生成は `/finish` が enqueue した
 *   apps/worker が行う (rewards-worker step3 で旧 generate API は廃止)
 * - ホーム遷移後にこのコンポーネントが mount され、polling で完了をキャッチ
 * - 1 分以上経過していたら諦める (古い state を見ない)
 */
export function PendingRewardsPopup({ apiUrl }: Props) {
  const [completed, setCompleted] = useState<RewardPreview[] | null>(null)

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
    /**
     * これらの reward は Pending 側が表示を担当する。MissedRewardsPopup が同じ home mount で
     * 同じ reward を二重ポップアップしないよう、ここで seen に確保する（Missed の判定は非同期
     * fetch 後なので、この同期書き込みが先に効く）
     */
    markRewardsSeen(itemIds)

    let attempts = 0
    let cancelled = false

    const poll = async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/internal/rewards/me?ids=${itemIds.join(",")}`)
        if (!res.ok) throw new Error(`status=${res.status}`)
        const data = await res.json() as GetMyRewardsResponse
        /**
         * worker が generation_status を completed / failed に確定させたら polling を終える。
         * grade_up は asset_svg_url を持たないので、旧 asset_svg_url ベースではなく
         * generation_status で判定する (rewards-worker step4)
         */
        const allSettled = parsed.items.every((p) => data.rewards.some(
          (r) => r.reward_id === p.reward_id
                    && (r.generation_status === "completed" || r.generation_status === "failed"),
        ))
        if (cancelled) return
        if (allSettled) {
          /** 表示は completed かつ asset 済みのものだけ（failed は出さない） */
          const matched = data.rewards.filter((r) =>
            itemIds.includes(r.reward_id)
            && r.generation_status === "completed"
            && r.asset_url !== null,
          )
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
    <RewardPreviewModal
      apiUrl={apiUrl}
      rewards={completed}
      onClose={() => setCompleted(null)}
    />
  )
}
