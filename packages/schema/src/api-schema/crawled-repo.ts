import { z } from "zod"

// ========================================================
// GET /api/crawled-repos - クロール済みリポジトリ一覧（言語別）
// ========================================================

/**
 * GET /api/crawled-repos の query string
 *
 * - language: スラッグ（例: "typescript" / "javascript"）
 * - limit: 1 ページの件数上限（ページング用。指定なしは 1000）
 * - offset: 取得開始位置（ページング用。指定なしは 0）
 */
export const getCrawledReposQueryStringSchema = z.object({
  language: z.string().min(1).max(32),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
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
 *
 * - total: 言語別の有効リポジトリ総数（ページ数算出用）
 */
export const getCrawledReposResponseSchema = z.object({
  entries: z.array(crawledRepoEntrySchema),
  language: z.string(),
  total: z.number().int().nonnegative(),
})

export type GetCrawledReposQueryString = z.infer<typeof getCrawledReposQueryStringSchema>
export type GetCrawledReposResponse = z.infer<typeof getCrawledReposResponseSchema>
