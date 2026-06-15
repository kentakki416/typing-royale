import { NextResponse } from "next/server"

import type { GetRankingsResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "@/libs/api-client"

const SUPPORTED_LANGUAGES = ["typescript", "javascript"] as const

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

/**
 * GET /api/internal/rankings?language=typescript&limit=10
 *
 * Client Component (ResultScreen) から /api/rankings の TOP N を取得するための bridge。
 * apps/web/CLAUDE.md「ブラウザから直接 Express を fetch しない」ルールに従う。
 * /api/rankings は公開 API なので認証ヘッダ不要
 */
export const GET = async (req: Request) => {
  const url = new URL(req.url)
  const rawLanguage = url.searchParams.get("language") ?? "typescript"
  const language: SupportedLanguage = isSupportedLanguage(rawLanguage) ? rawLanguage : "typescript"
  const rawLimit = Number(url.searchParams.get("limit") ?? "10")
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 10 ? Math.floor(rawLimit) : 10

  try {
    const res = await apiClient.get<GetRankingsResponse>(
      `/api/rankings?language=${language}&limit=${limit}`,
    )
    return NextResponse.json(res)
  } catch (err) {
    if (err instanceof ApiClientError) {
      return NextResponse.json(err.body ?? { error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
