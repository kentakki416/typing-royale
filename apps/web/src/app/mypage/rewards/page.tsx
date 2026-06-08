import type { Metadata } from "next"
import Link from "next/link"

import type { GetMyRewardsResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { env } from "@/env"
import { apiClient } from "@/libs/api-client"

export const metadata: Metadata = {
  title: "特典 - Typing Royale",
}

type Reward = GetMyRewardsResponse["rewards"][number]

/**
 * マイページ「特典」タブ
 *
 * 自分の獲得済み rewards (達成カード PNG) を grid 表示。PNG プレビュー +
 * ダウンロード + X シェア動線
 */
export default async function MyPageRewards() {
  const data = await apiClient.get<GetMyRewardsResponse>("/api/rewards/me")

  return (
    <>
      <Topbar />

      <div className="container">
        <h1 className="mb-16">獲得した特典</h1>

        <div className="tabs">
          <Link className="tab" href="/mypage">概要</Link>
          <Link className="tab active" href="/mypage/rewards">特典</Link>
          <a className="tab" href="#">プレイ履歴</a>
          <Link className="tab" href="/mypage/badge">バッジ</Link>
          <Link className="tab" href="/mypage/hall-of-fame-comments">Hall of Fame</Link>
          <Link className="tab" href="/mypage/account">設定</Link>
        </div>

        {data.rewards.length === 0 ? (
          <div className="card text-center" style={{ padding: "48px 16px" }}>
            <div className="text-mono text-muted mb-16">まだ獲得した特典がありません</div>
            <p className="text-sm text-muted mb-16">
              グレードアップすると達成カードが自動生成されます
            </p>
            <Link className="btn btn-primary btn-play" href="/play">
              ▶ プレイ開始
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {data.rewards.map((r) => <RewardCard key={r.reward_id} reward={r} />)}
          </div>
        )}
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a>
      </div>
    </>
  )
}

const RewardCard = ({ reward }: { reward: Reward }) => {
  const fullAssetUrl = reward.asset_url === null
    ? null
    : reward.asset_url.startsWith("http")
      ? reward.asset_url
      : `${env.API_URL}${reward.asset_url}`
  const grantedYmd = new Date(reward.granted_at).toISOString().slice(0, 10)
  const label = formatRewardLabel(reward)
  const shareText = `${label} を獲得！ #TypingRoyale`
  const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}`

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{label}</div>
        <span className="text-sm text-muted">{grantedYmd}</span>
      </div>
      {fullAssetUrl === null ? (
        <div className="text-sm text-muted text-center" style={{ padding: "32px 0" }}>
          画像生成中（しばらく待つか再生成してください）
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          alt={label}
          src={fullAssetUrl}
          style={{
            background: "var(--bg-surface-2)",
            borderRadius: "4px",
            width: "100%",
          }}
        />
      )}
      <div className="flex gap-8 mt-8" style={{ flexWrap: "wrap" }}>
        {fullAssetUrl !== null && (
          <a
            className="btn"
            download={`typing-royale-reward-${reward.reward_id}.png`}
            href={fullAssetUrl}
          >
            ダウンロード
          </a>
        )}
        <a
          className="btn"
          href={shareUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          𝕏 にポスト
        </a>
      </div>
    </div>
  )
}

const formatRewardLabel = (reward: Reward): string => {
  if (reward.type === "grade_up") {
    const slug = (reward.payload as { grade_slug?: string }).grade_slug ?? ""
    const name = GRADE_NAMES[slug] ?? slug
    return `🏆 ${name} 昇格`
  }
  if (reward.type === "card") {
    const label = (reward.payload as { milestone_label?: string }).milestone_label ?? "達成"
    return `🎖 ${label}`
  }
  return reward.type
}

const GRADE_NAMES: Record<string, string> = {
  distinguished: "Distinguished Engineer",
  fellow: "Fellow",
  intern: "Intern",
  junior: "Junior Developer",
  mid: "Mid Developer",
  principal: "Principal Engineer",
  senior: "Senior Engineer",
  staff: "Staff Engineer",
}
