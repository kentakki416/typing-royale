import { NextResponse } from "next/server"

import type { GenerateRewardRequest, GenerateRewardResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"

/**
 * POST /api/internal/rewards/generate
 *
 * Client Component (ResultScreen) から /api/rewards/generate を fire-and-forget で
 * 叩くための bridge。apps/web/CLAUDE.md「ブラウザから直接 Express を fetch しない」
 * ルールに従う。詳細は docs/spec/special-badges/step5-web-home-popup.md
 */
export async function POST(req: Request) {
  const accessToken = await getAccessToken()
  if (accessToken === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: GenerateRewardRequest
  try {
    body = await req.json() as GenerateRewardRequest
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const res = await apiClient.post<GenerateRewardResponse>(
      "/api/rewards/generate",
      body,
    )
    return NextResponse.json(res)
  } catch (err) {
    if (err instanceof ApiClientError) {
      return NextResponse.json(
        err.body ?? { error: "Failed to generate" },
        { status: err.status },
      )
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}
