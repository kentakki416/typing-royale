import { NextResponse } from "next/server"

import type { GetCrawledReposResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "@/libs/api-client"
import { getLanguages, resolveSelectedLanguage } from "@/libs/languages"

/**
 * GET /api/internal/crawled-repos?language=typescript&limit=5
 *
 * Client Component (CrawledReposSection) から /api/crawled-repos を呼ぶための bridge。
 * apps/web/CLAUDE.md「ブラウザから直接 Express を fetch しない」ルールに従う。
 * 言語は languages マスタ（getLanguages, 24h キャッシュ）で検証し、新言語も自動対応する
 */
export const GET = async (req: Request) => {
  const url = new URL(req.url)
  const languages = await getLanguages()
  const language =
    resolveSelectedLanguage(languages, url.searchParams.get("language") ?? undefined) ?? "typescript"
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
