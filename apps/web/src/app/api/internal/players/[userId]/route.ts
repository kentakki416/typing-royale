import { NextResponse } from "next/server"

import type { GetPlayerResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "@/libs/api-client"

/**
 * GET /api/internal/players/:userId
 *
 * Client Component (ランキングの選択モーダル) からプレイヤー詳細を取得するための bridge。
 * apps/web/CLAUDE.md「ブラウザから直接 Express を fetch しない」ルールに従う。
 * 選択時カードはオールタイムベスト統一のため /api/players/:id を出どころにする。
 */
export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) => {
  const { userId } = await params
  const id = Number(userId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 })
  }

  try {
    const res = await apiClient.get<GetPlayerResponse>(`/api/players/${id}`)
    return NextResponse.json(res)
  } catch (err) {
    if (err instanceof ApiClientError) {
      return NextResponse.json(err.body ?? { error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
