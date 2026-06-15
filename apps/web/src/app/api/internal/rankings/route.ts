import { NextResponse } from "next/server"

import type { GetRankingsResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "@/libs/api-client"

const SUPPORTED_LANGUAGES = ["typescript", "javascript"] as const

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

/**
 * GET /api/internal/rankings?language=typescript
 *
 * Client Component (ResultScreen) から /api/rankings の総参加者数を取得するための bridge。
 * apps/web/CLAUDE.md「ブラウザから直接 Express を fetch しない」ルールに従う。
 * ゲストが「Y 人中」を表示するために必要
 */
export const GET = async (req: Request) => {
  const url = new URL(req.url)
  const rawLanguage = url.searchParams.get("language") ?? "typescript"
  const language: SupportedLanguage = isSupportedLanguage(rawLanguage) ? rawLanguage : "typescript"

  try {
    const res = await apiClient.get<GetRankingsResponse>(
      `/api/rankings?language=${language}&limit=1`,
    )
    return NextResponse.json(res)
  } catch (err) {
    if (err instanceof ApiClientError) {
      return NextResponse.json(err.body ?? { error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
