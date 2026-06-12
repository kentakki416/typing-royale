import { NextRequest, NextResponse } from "next/server"

import { apiClient } from "@/libs/api-client"

/**
 * Client Component からゲスト用 /finish を叩くための proxy
 * （ブラウザから直接 Express を叩かない方針のため）
 *
 * 認証必須版 (`/api/play-sessions/[id]/finish/route.ts`) との違い:
 * - path param `:id` を取らない（ゲストは Redis state を持たないため）
 * - 認証 cookie は付与してもしなくても良い（Express 側で認証不要）
 */
export async function POST(req: NextRequest) {
  const body = await req.json()

  try {
    const res = await apiClient.post("/api/play-sessions/guest/finish", body)
    return NextResponse.json(res)
  } catch {
    /**
     * apiClient はエラーで throw するため、ここで適切な status を返す
     */
    return NextResponse.json({ error: "Finish failed" }, { status: 500 })
  }
}
