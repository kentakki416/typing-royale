import { NextResponse } from "next/server"

import type { GetRankingsResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "@/libs/api-client"
import { getLanguages, resolveSelectedLanguage } from "@/libs/languages"

/**
 * GET /api/internal/rankings?language=typescript
 *
 * Client Component (ResultScreen) から /api/rankings の総参加者数を取得するための bridge。
 * apps/web/CLAUDE.md「ブラウザから直接 Express を fetch しない」ルールに従う。
 * ゲストが「Y 人中」を表示するために必要。言語は languages マスタで検証する
 */
export const GET = async (req: Request) => {
  const url = new URL(req.url)
  const languages = await getLanguages()
  const language =
    resolveSelectedLanguage(languages, url.searchParams.get("language") ?? undefined) ?? "typescript"

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
