import { NextResponse } from "next/server"

import type { GetMyRewardsResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"

/**
 * GET /api/internal/rewards/me?ids=1,2,3
 *
 * Client Component (PendingRewardsPopup) から /api/rewards/me を polling するための
 * bridge。`?ids=` で reward id 絞り込み (省略時は全件)。詳細は
 * docs/spec/special-badges/step5-web-home-popup.md
 */
export async function GET(req: Request) {
  const accessToken = await getAccessToken()
  if (accessToken === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const ids = url.searchParams.get("ids")
  const path = ids === null ? "/api/rewards/me" : `/api/rewards/me?ids=${encodeURIComponent(ids)}`

  try {
    const res = await apiClient.get<GetMyRewardsResponse>(path)
    return NextResponse.json(res)
  } catch (err) {
    if (err instanceof ApiClientError) {
      return NextResponse.json(
        err.body ?? { error: "Failed to fetch" },
        { status: err.status },
      )
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}
