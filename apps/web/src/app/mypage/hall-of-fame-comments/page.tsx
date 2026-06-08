import type { Metadata } from "next"
import Link from "next/link"

import type { GetHallOfFameResponse, GetUserResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"

import { CommentEditForm } from "./comment-edit-form"

export const metadata: Metadata = {
  title: "Hall of Fame コメント編集 - Typing Royale",
}

type Entry = GetHallOfFameResponse["entries"][number]

const findMineEntry = (entries: Entry[], userId: number): { entryId: number; comment: string } | null => {
  const mine = entries.find((e) => e.user.id === userId && e.entry_id !== null)
  if (!mine || mine.entry_id === null) return null
  return { comment: mine.comment ?? "", entryId: mine.entry_id }
}

/**
 * マイページ「Hall of Fame」タブ
 *
 * TS / JS の Hall of Fame を並列 fetch して自分の entry を抽出し、
 * 各言語のコメントを編集できる
 */
export default async function MyPageHofComments() {
  const [me, tsHof, jsHof] = await Promise.all([
    apiClient.get<GetUserResponse>("/api/user"),
    apiClient.get<GetHallOfFameResponse>("/api/hall-of-fame?language=typescript"),
    apiClient.get<GetHallOfFameResponse>("/api/hall-of-fame?language=javascript"),
  ])

  const tsEntry = findMineEntry(tsHof.entries, me.id)
  const jsEntry = findMineEntry(jsHof.entries, me.id)

  return (
    <>
      <Topbar />

      <div className="container">
        <h1 className="mb-16">Hall of Fame コメント編集</h1>

        <div className="tabs">
          <Link className="tab" href="/mypage">概要</Link>
          <Link className="tab" href="/mypage/rewards">特典</Link>
          <a className="tab" href="#">プレイ履歴</a>
          <Link className="tab" href="/mypage/badge">バッジ</Link>
          <Link className="tab active" href="/mypage/hall-of-fame-comments">Hall of Fame</Link>
          <Link className="tab" href="/mypage/account">設定</Link>
        </div>

        <p className="text-sm text-muted mb-16">
          各言語の TOP 10 圏内に入っているとき、ここでコメントを編集できます。送信した瞬間に
          <Link href="/hall-of-fame"> Hall of Fame</Link> に反映されます。
        </p>

        <CommentEditForm jsEntry={jsEntry} tsEntry={tsEntry} />
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a>
      </div>
    </>
  )
}
