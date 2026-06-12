import { NextRequest, NextResponse } from "next/server"

import { ApiClientError, apiClient } from "@/libs/api-client"

/**
 * Client Component から /finish を叩くための proxy
 * （ブラウザから直接 Express を叩かない方針のため）
 *
 * ApiClientError なら Express が返した status / body をそのまま転送して
 * 4xx / 5xx の区別をクライアントに保たせる。
 * 想定外エラー（network 切断など）のみ 500 で包む
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()

  try {
    const res = await apiClient.post(`/api/play-sessions/${id}/finish`, body)
    return NextResponse.json(res)
  } catch (err) {
    if (err instanceof ApiClientError) {
      return NextResponse.json(
        err.body ?? { error: "Finish failed" },
        { status: err.status },
      )
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}
