import { z } from "zod"

// ===========================
// GET /api/user/:id
// ===========================

/**
 * ユーザー取得APIのリクエストスキーマ
 * GETリクエストのパスパラメータとして受け取る
 */
export const getUserRequestSchema = z.object({
  id: z.string().min(1, "IDは必須です"),
})

/**
 * ユーザー取得APIのレスポンススキーマ
 */
export const getUserResponseSchema = z.object({
  id: z.string(),
  message: z.string(),
  timestamp: z.string(),
})

// TypeScript型を推論
export type GetUserRequest = z.infer<typeof getUserRequestSchema>
export type GetUserResponse = z.infer<typeof getUserResponseSchema>
