import { NextRequest, NextResponse } from "next/server"

import { apiClient } from "@/libs/api-client"

/**
 * Client Component から /finish を叩くための proxy
 * （ブラウザから直接 Express を叩かない方針のため）
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
  } catch {
    /**
     * apiClient はエラーで throw するため、ここで適切な status を返す
     */
    return NextResponse.json({ error: "Finish failed" }, { status: 500 })
  }
}
