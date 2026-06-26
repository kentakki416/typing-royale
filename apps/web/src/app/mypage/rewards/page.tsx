import type { Metadata } from "next"
import Link from "next/link"

import type { GetBadgeConfigResponse, GetMyRewardsResponse, GetUserResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { env } from "@/env"
import { apiClient } from "@/libs/api-client"

import { BadgeForm } from "./badge-form"
import { RewardsTabs } from "./rewards-tabs"

export const metadata: Metadata = {
  title: "特典 - Typing Royale",
}

/**
 * マイページ「特典」タブ
 *
 * 自分の獲得済み rewards を 3 種別タブ (グレードアップ / 殿堂入り / 月間) で表示。
 * 各カードに PNG / SVG の個別 DL ボタンと README 用 Markdown コピーボタン。
 * 加えて「README バッジ」設定（動的 SVG バッジの表示項目）も同タブに集約する。
 * 詳細: docs/spec/special-badges/step6-web-mypage-rewards-tabs.md
 */
export default async function MyPageRewards() {
  const [rewardsRes, me, badgeConfig] = await Promise.all([
    apiClient.get<GetMyRewardsResponse>("/api/rewards/me"),
    apiClient.get<GetUserResponse>("/api/user"),
    apiClient.get<GetBadgeConfigResponse>("/api/user/badge-config"),
  ])

  const username = me.github_username ?? `user${me.id}`

  return (
    <>
      <Topbar isAuthed={true} />

      <div className="container">
        <h1 className="mb-16">獲得した特典</h1>

        <div className="tabs">
          <Link className="tab" href="/mypage">サマリー</Link>
          <Link className="tab active" href="/mypage/rewards">特典</Link>
          <Link className="tab" href="/mypage/account">設定</Link>
        </div>

        <RewardsTabs
          apiUrl={env.API_URL}
          appUrl={env.NEXT_PUBLIC_APP_URL}
          rewards={rewardsRes.rewards}
          username={username}
        />

        <h2 className="mt-24 mb-8">🏷 README バッジ</h2>
        <p className="text-sm text-muted mb-16">
          README に貼れる動的 SVG バッジに表示する項目を選べます。
        </p>
        <BadgeForm initialDisplayItems={badgeConfig.display_items} username={username} />
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a>
      </div>
    </>
  )
}
