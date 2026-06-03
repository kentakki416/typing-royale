import express from "express"

import { generateAccessToken } from "../../src/lib/jwt"
import { authMiddleware } from "../../src/middleware/auth"
import { errorHandler } from "../../src/middleware/error-handler"
import { User } from "../../src/types/domain"

import { testPrisma } from "./setup"

/**
 * テスト用Expressアプリを構築する
 * 本番と同じミドルウェア構成を再現する
 *
 * エラーハンドラをルート登録後に適用したい場合は、
 * `createTestApp()` → ルート登録 → `attachErrorHandler(app)` の順に呼び出す
 */
export const createTestApp = (): express.Express => {
  const app = express()
  app.use(express.json())
  app.use(authMiddleware)
  return app
}

/**
 * ルート登録後にグローバルエラーハンドラを登録する
 * （Express の仕様上、エラーハンドラはルートの後に登録する必要がある）
 */
export const attachErrorHandler = (app: express.Express): void => {
  app.use(errorHandler)
}

/**
 * テスト用ユーザーをDBに作成し、JWTトークンを返す
 * 認証必須のAPIテストで、リクエスト前に呼び出して使用する
 */
export const createTestUser = async (overrides?: {
  avatarUrl?: string
  email?: string
  name?: string
}): Promise<{ token: string; user: User }> => {
  const prismaUser = await testPrisma.user.create({
    data: {
      avatarUrl: overrides?.avatarUrl ?? "https://example.com/avatar.jpg",
      email: overrides?.email ?? `test-${Date.now()}@example.com`,
      name: overrides?.name ?? "Test User",
    },
  })

  const user: User = {
    avatarUrl: prismaUser.avatarUrl,
    createdAt: prismaUser.createdAt,
    email: prismaUser.email,
    id: prismaUser.id,
    name: prismaUser.name,
    updatedAt: prismaUser.updatedAt,
  }

  const token = generateAccessToken(user.id)

  return { token, user }
}
