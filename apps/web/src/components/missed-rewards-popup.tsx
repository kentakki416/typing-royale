"use client"

import { useEffect, useState } from "react"

import type { GetMyRewardsResponse } from "@repo/api-schema"

import { RewardPreviewModal, type RewardPreview } from "./reward-preview-modal"

const STORAGE_KEY = "seen-reward-ids"
/** 7 日以上前の reward は対象外 */
const RECENT_DAYS = 7
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000
/** localStorage を膨張させないため直近 N 件だけ保持 */
const MAX_SEEN_IDS = 100

/**
 * ホーム画面アクセス時に「worker が完了済 / ユーザーが未確認」の reward があれば
 * 1 回だけ popup 表示する。詳細: docs/spec/rewards-worker/step4-web-ux-and-missed-popup.md
 *
 * `PendingRewardsPopup`（sessionStorage 起点）と共存する。
 * - `PendingRewardsPopup` がリザルト直後の popup を担当
 * - 本コンポーネントが「タブ閉じ→再訪」「リザルト画面を即離脱」等の取りこぼしを担当
 */
export function MissedRewardsPopup() {
  const [target, setTarget] = useState<RewardPreview | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/internal/rewards/me")
        if (!res.ok) return
        const data = await res.json() as GetMyRewardsResponse

        const seenIds = readSeenIds()
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
      rewards={[target]}
      onClose={() => {
        markSeen(target.reward_id)
        setTarget(null)
      }}
    />
  )
}

const readSeenIds = (): Set<number> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((n): n is number => typeof n === "number"))
  } catch {
    return new Set()
  }
}

const markSeen = (rewardId: number): void => {
  const ids = readSeenIds()
  ids.add(rewardId)
  const list = Array.from(ids).slice(-MAX_SEEN_IDS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}
