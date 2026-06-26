import { z } from "zod"

// ========================================================
// GET /api/languages - 言語マスタ一覧
// ========================================================

/**
 * 言語マスタ 1 件
 */
const languageItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  slug: z.string().min(1),
})

/**
 * GET /api/languages のレスポンス
 */
export const getLanguagesResponseSchema = z.object({
  languages: z.array(languageItemSchema),
})

export type LanguageItem = z.infer<typeof languageItemSchema>
export type GetLanguagesResponse = z.infer<typeof getLanguagesResponseSchema>
