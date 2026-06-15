import Link from "next/link"

import { Topbar } from "@/components/topbar"
import { getAccessToken } from "@/libs/auth"

/**
 * /replay/[playSessionId] の 404 ページ
 */
export default async function ReplayNotFound() {
  const accessToken = await getAccessToken()
  return (
    <>
      <Topbar active="ranking" isAuthed={accessToken !== null} />
      <div className="container container-narrow text-center mt-24">
        <h1>リプレイが見つかりません</h1>
        <p className="text-muted mt-8">
          リプレイが削除されたか、プレイヤーが非公開設定になっている可能性があります。
        </p>
        <div className="flex gap-12 mt-24" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/ranking">ランキングへ戻る</Link>
        </div>
      </div>
    </>
  )
}
