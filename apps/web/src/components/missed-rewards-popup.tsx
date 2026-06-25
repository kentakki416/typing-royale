"use client"

import { useEffect, useState } from "react"

import type { GetMyRewardsResponse } from "@repo/api-schema"

import { markRewardsSeen, readSeenRewardIds } from "@/libs/reward-seen"

import { RewardPreviewModal, type RewardPreview } from "./reward-preview-modal"

/** 7 日以上前の reward は対象外 */
const RECENT_DAYS = 7
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000

/**
 * ホーム画面アクセス時に「worker が完了済 / ユーザーが未確認」の reward があれば
 * 1 回だけ popup 表示する。詳細: docs/spec/rewards-worker/step4-web-ux-and-missed-popup.md
 *
 * `PendingRewardsPopup`（sessionStorage 起点）と共存する。
 * - `PendingRewardsPopup` がリザルト直後の popup を担当
 * - 本コンポーネントが「タブ閉じ→再訪」「リザルト画面を即離脱」等の取りこぼしを担当
 */
type Props = {
    /** Express API の origin。相対 asset_url の前に付けてブラウザから画像を取得する */
    apiUrl: string
}

export function MissedRewardsPopup({ apiUrl }: Props) {
  const [target, setTarget] = useState<RewardPreview | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/internal/rewards/me")
        if (!res.ok) return
        const data = await res.json() as GetMyRewardsResponse

        const seenIds = readSeenRewardIds()
        const sinceMs = Date.now() - RECENT_MS

        /** completed + 直近 + 未表示 の最初の 1 件 */
        const candidate = data.rewards.find((r) =>
          r.generation_status === "completed"
          && r.asset_url !== null
          && Date.parse(r.granted_at) >= sinceMs
          && !seenIds.has(r.reward_id),
        )

        if (candidate !== undefined) {
          setTarget(candidate)
        }
      } catch {
        /** 補助動線のためサイレントに無視 */
      }
    })()
  }, [])

  if (target === null) return null

  return (
    <RewardPreviewModal
      apiUrl={apiUrl}
      rewards={[target]}
      onClose={() => {
        markRewardsSeen([target.reward_id])
        setTarget(null)
      }}
    />
  )
}
