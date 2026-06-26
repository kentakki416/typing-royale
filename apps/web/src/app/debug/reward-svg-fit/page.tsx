import type { GetMyRewardsResponse } from "@repo/api-schema"

import { RewardsTabs } from "../../mypage/rewards/rewards-tabs"

/**
 * 一時 debug ページ（PR スクショ用）。
 * 殿堂入りカード（PNG + 360px 幅の SVG バッジ）を mock で render し、SVG がカード枠に
 * 収まること + PNG/SVG ラベルが付くことを確認する。スクショ取得後に削除する。
 */
const HOF_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="80" viewBox="0 0 360 80">' +
  '<rect width="360" height="80" rx="10" fill="#15172b"/>' +
  '<rect width="360" height="80" rx="10" fill="none" stroke="#ffd54a" stroke-width="1.5"/>' +
  '<rect x="0" y="0" width="6" height="80" rx="3" fill="#ffd54a"/>' +
  '<text x="22" y="32" font-family="sans-serif" font-size="11" font-weight="700" fill="#ffd54a" letter-spacing="2">👑 HALL OF FAME</text>' +
  '<text x="22" y="60" font-family="sans-serif" font-size="22" font-weight="900" fill="#fff">#1 TypeScript</text>' +
  "</svg>"

const MOCK = [
  {
    asset_svg_url: HOF_SVG,
    asset_url: "https://typing-royale-prd-rewards.s3.ap-northeast-1.amazonaws.com/special-badges/1-hof-typescript.png",
    generation_status: "completed",
    granted_at: "2026-06-20T00:00:00.000Z",
    payload: { language: "typescript", rank: 1 },
    reward_id: 1,
    type: "hall_of_fame_in",
  },
] as unknown as GetMyRewardsResponse["rewards"]

export default function DebugRewardSvgFit() {
  return (
    <div className="container">
      <h1 className="mb-16">獲得した特典（SVG fit 確認）</h1>
      <RewardsTabs apiUrl="https://api.typing-royale.com" rewards={MOCK} />
    </div>
  )
}
