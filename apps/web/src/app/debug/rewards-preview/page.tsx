import Link from "next/link"

import { BadgeForm } from "../../mypage/rewards/badge-form"
import { RewardsTabs } from "../../mypage/rewards/rewards-tabs"

/**
 * 一時 debug ページ（PR スクショ用）。
 *
 * mypage は認証必須で Vercel preview では sign-in にリダイレクトされるため、
 * 特典タブの新レイアウト（3タブ + README バッジセクション統合）を mock data で単独 render する。
 * スクショ取得後に削除する（コミットしない／proxy の /debug 公開も戻す）。
 */
export default function DebugRewardsPreview() {
  return (
    <div className="container">
      <h1 className="mb-16">獲得した特典</h1>

      <div className="tabs">
        <Link className="tab" href="/mypage">サマリー</Link>
        <Link className="tab active" href="/mypage/rewards">特典</Link>
        <Link className="tab" href="/mypage/account">設定</Link>
      </div>

      <RewardsTabs
        apiUrl="https://api.typing-royale.com"
        appUrl="https://typing-royale.com"
        rewards={[]}
        username="octocat"
      />

      <h2 className="mt-24 mb-8">🏷 README バッジ</h2>
      <p className="text-sm text-muted mb-16">
        README に貼れる動的 SVG バッジに表示する項目を選べます。
      </p>
      <BadgeForm
        initialDisplayItems={["grade", "best_score", "rank", "username"]}
        username="octocat"
      />
    </div>
  )
}
