import { NextResponse } from "next/server"

import type { GetCrawledReposResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "@/libs/api-client"

const SUPPORTED_LANGUAGES = ["typescript", "javascript"] as const

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

/**
 * GET /api/internal/crawled-repos?language=typescript&limit=5
 *
 * Client Component (CrawledReposSection) から /api/crawled-repos を呼ぶための bridge。
 * apps/web/CLAUDE.md「ブラウザから直接 Express を fetch しない」ルールに従う
 */
export const GET = async (req: Request) => {
  const url = new URL(req.url)
  const rawLanguage = url.searchParams.get("language") ?? "typescript"
  const language: SupportedLanguage = isSupportedLanguage(rawLanguage) ? rawLanguage : "typescript"
  const rawLimit = Number(url.searchParams.get("limit") ?? "5")
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 1000 ? Math.floor(rawLimit) : 5

  try {
    const res = await apiClient.get<GetCrawledReposResponse>(
      `/api/crawled-repos?language=${language}&limit=${limit}`,
    )
    return NextResponse.json(res)
  } catch (err) {
    if (err instanceof ApiClientError) {
      return NextResponse.json(err.body ?? { error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
