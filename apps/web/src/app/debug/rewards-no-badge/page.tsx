import Link from "next/link"

import type { GetMyRewardsResponse } from "@repo/api-schema"

import { RewardsTabs } from "../../mypage/rewards/rewards-tabs"

/**
 * 一時 debug ページ（PR スクショ用）。
 * README バッジ削除後の「特典」タブを mock data で render する。
 * 各カードに PNG/SVG DL のみ（「README 用 Markdown をコピー」ボタンは削除済み）、
 * RewardsTabs の下に「🏷 README バッジ」設定セクションが無いことを示す。
 * スクショ取得後に削除する（proxy の /debug 公開も戻す）。
 */
const MOCK = [
  {
    asset_svg_url: null,
    asset_url: "https://typing-royale-prd-rewards.s3.ap-northeast-1.amazonaws.com/1-3.png",
    generation_status: "completed",
    granted_at: "2026-06-20T00:00:00.000Z",
    payload: { grade_slug: "staff" },
    reward_id: 1,
    type: "grade_up",
  },
] as unknown as GetMyRewardsResponse["rewards"]

export default function DebugRewardsNoBadge() {
  return (
    <div className="container">
      <h1 className="mb-16">獲得した特典</h1>
      <div className="tabs mb-24">
        <Link className="tab" href="/mypage">サマリー</Link>
        <Link className="tab active" href="/mypage/rewards">特典</Link>
        <Link className="tab" href="/mypage/account">設定</Link>
      </div>
      <RewardsTabs apiUrl="https://api.typing-royale.com" rewards={MOCK} />
      <p className="text-sm text-muted mt-24">
        （README バッジ設定セクションは削除済み。カードは PNG/SVG DL のみ）
      </p>
    </div>
  )
}
