import type { Metadata } from "next"

import type { GetMyRewardsResponse } from "@repo/api-schema"

import { MyPageHeader } from "@/components/mypage-header"
import { Topbar } from "@/components/topbar"
import { env } from "@/env"
import { apiClient } from "@/libs/api-client"
import { getMyPageHeaderData } from "@/libs/mypage"

import { RewardsTabs } from "./rewards-tabs"

export const metadata: Metadata = {
  title: "特典 - Typing Royale",
}

/**
 * マイページ「特典」タブ
 *
 * 自分の獲得済み rewards を 3 種別タブ (グレードアップ / 殿堂入り / 月間) で表示。
 * 各カードに PNG / SVG の個別 DL ボタンを表示する。
 * 詳細: docs/spec/special-badges/step6-web-mypage-rewards-tabs.md
 */
export default async function MyPageRewards() {
  const [{ grade, me }, rewardsRes] = await Promise.all([
    getMyPageHeaderData(),
    apiClient.get<GetMyRewardsResponse>("/api/rewards/me"),
  ])

  return (
    <>
      <Topbar isAuthed={true} />

      <div className="container">
        <MyPageHeader active="rewards" grade={grade} me={me} />

        <RewardsTabs apiUrl={env.API_URL} rewards={rewardsRes.rewards} />
      </div>
    </>
  )
}
