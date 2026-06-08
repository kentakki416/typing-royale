import Link from "next/link"

import { Topbar } from "@/components/topbar"

/**
 * /players/[userId] の 404 ページ
 *
 * 表示条件:
 * - 存在しない userId
 * - 不正な userId（数値変換できない / 0 以下）
 * - canPublicRanking=false のユーザー（API が 404 を返すため）
 */
export default function NotFound() {
  return (
    <>
      <Topbar />
      <div className="container container-narrow text-center mt-24">
        <h1>プレイヤーが見つかりません</h1>
        <p className="text-muted mt-8">
          URL が間違っているか、このプレイヤーはランキングを非公開にしています。
        </p>
        <div className="flex gap-12 mt-24" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/ranking">ランキングに戻る</Link>
          <Link className="btn" href="/">トップへ</Link>
        </div>
      </div>
    </>
  )
}
