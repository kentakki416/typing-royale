import type { Metadata } from "next"

import { MyPageHeader } from "@/components/mypage-header"
import { Topbar } from "@/components/topbar"
import { getMyPageHeaderData } from "@/libs/mypage"

import { AccountForm } from "./account-form"

export const metadata: Metadata = {
  title: "設定 - Typing Royale",
}

/**
 * マイページ > 設定（mock: mypage-settings.html 準拠）
 */
export default async function AccountSettingsPage() {
  const { grade, me } = await getMyPageHeaderData()

  return (
    <>
      <Topbar isAuthed={true} />

      <div className="container">
        <MyPageHeader active="account" grade={grade} me={me} />

        <AccountForm initialUser={me} />
      </div>
    </>
  )
}
