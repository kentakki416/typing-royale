import type { Metadata } from "next"
import Link from "next/link"

import type { GetBadgeConfigResponse, GetUserResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"

import { BadgeForm } from "./badge-form"

export const metadata: Metadata = {
  title: "バッジ設定 - Typing Royale",
}

/**
 * マイページ「バッジ」タブ
 *
 * 自分の display_items を編集してリアルタイムプレビューを見せる。
 * 保存は Server Action 経由で PUT /api/user/badge-config
 */
export default async function MyPageBadge() {
  const [me, config] = await Promise.all([
    apiClient.get<GetUserResponse>("/api/user"),
    apiClient.get<GetBadgeConfigResponse>("/api/user/badge-config"),
  ])

  return (
    <>
      <Topbar isAuthed={true} />

      <div className="container">
        <h1 className="mb-16">バッジ設定</h1>

        <div className="tabs">
          <Link className="tab" href="/mypage">概要</Link>
          <Link className="tab" href="/mypage/rewards">特典</Link>
          <a className="tab" href="#">プレイ履歴</a>
          <Link className="tab active" href="/mypage/badge">バッジ</Link>
          <Link className="tab" href="/mypage/hall-of-fame-comments">殿堂入り</Link>
          <Link className="tab" href="/mypage/account">設定</Link>
        </div>

        <BadgeForm
          initialDisplayItems={config.display_items}
          username={me.display_name ?? `user${me.id}`}
        />
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a>
      </div>
    </>
  )
}
