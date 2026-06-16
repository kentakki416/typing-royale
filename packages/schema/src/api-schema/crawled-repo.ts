import { z } from "zod"

// ========================================================
// GET /api/crawled-repos - クロール済みリポジトリ一覧（言語別）
// ========================================================

/**
 * GET /api/crawled-repos の query string
 *
 * - language: スラッグ（例: "typescript" / "javascript"）
 * - limit: 件数上限（指定なしなら全件相当の 1000 を上限）
 */
export const getCrawledReposQueryStringSchema = z.object({
  language: z.string().min(1).max(32),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
})

/**
 * 1 件のリポジトリ表示情報
 */
const crawledRepoEntrySchema = z.object({
  description: z.string().nullable(),
  full_name: z.string(),
  homepage: z.string().nullable(),
  name: z.string(),
  owner: z.string(),
  stars: z.number().int().nonnegative(),
  stored_count: z.number().int().nonnegative(),
  topics: z.array(z.string()),
})

/**
 * GET /api/crawled-repos のレスポンス
 */
export const getCrawledReposResponseSchema = z.object({
  entries: z.array(crawledRepoEntrySchema),
  language: z.string(),
})

export type GetCrawledReposQueryString = z.infer<typeof getCrawledReposQueryStringSchema>
export type GetCrawledReposResponse = z.infer<typeof getCrawledReposResponseSchema>
