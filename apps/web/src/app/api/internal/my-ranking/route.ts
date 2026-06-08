import { NextResponse } from "next/server"

import type { GetMyRankingResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"

const SUPPORTED_LANGUAGES = ["typescript", "javascript"] as const

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

/**
 * GET /api/internal/my-ranking?language=typescript
 *
 * Client Component (ResultScreen) から /api/rankings/me を呼ぶための bridge。
 * apps/web/CLAUDE.md「ブラウザから直接 Express を fetch しない」ルールに従う。
 * 認証は apiClient 内部で getAccessToken → Authorization: Bearer ヘッダで転送される
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const rawLanguage = url.searchParams.get("language") ?? "typescript"
  const language: SupportedLanguage = isSupportedLanguage(rawLanguage) ? rawLanguage : "typescript"

  const accessToken = await getAccessToken()
  if (accessToken === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const res = await apiClient.get<GetMyRankingResponse>(
      `/api/rankings/me?language=${language}`,
    )
    return NextResponse.json(res)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}
