import type { Metadata } from "next"
import Link from "next/link"

import { GetUserResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"

import { AccountForm } from "./account-form"

export const metadata: Metadata = {
  title: "設定 - Typing Royale",
}

/**
 * マイページ > 設定（mock: mypage-settings.html 準拠）
 */
export default async function AccountSettingsPage() {
  const me = await apiClient.get<GetUserResponse>("/api/user")
  const initials = (me.github_username ?? "??").slice(0, 2).toUpperCase()

  return (
    <>
      <Topbar isAuthed={true} />

      <div className="container">
        <div className="flex gap-16 mb-24" style={{ alignItems: "center" }}>
          <span className="avatar lg">{initials}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ marginBottom: "4px" }}>{me.github_username ?? "(no name)"}</h1>
            <div className="text-muted text-sm">アカウント設定</div>
          </div>
        </div>

        <div className="tabs">
          <Link className="tab" href="/mypage">サマリー</Link>
          <Link className="tab" href="/mypage/rewards">特典</Link>
          <Link className="tab active" href="/mypage/account">設定</Link>
        </div>

        <AccountForm initialUser={me} />
      </div>
    </>
  )
}
