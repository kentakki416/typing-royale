import express from "express"

import { generateAccessToken } from "../../src/lib/jwt"
import { authMiddleware } from "../../src/middleware/auth"
import { unhandledExceptionHandler } from "../../src/middleware/unhandled-exception-handler"
import { User } from "../../src/types/domain"

import { testPrisma } from "./setup"

/**
 * テスト用Expressアプリを構築する
 * 本番と同じミドルウェア構成を再現する
 *
 * 想定外例外ハンドラをルート登録後に適用したい場合は、
 * `createTestApp()` → ルート登録 → `attachUnhandledExceptionHandler(app)` の順に呼び出す
 */
export const createTestApp = (): express.Express => {
  const app = express()
  app.use(express.json())
  app.use(authMiddleware)
  return app
}

/**
 * ルート登録後に想定外例外ハンドラを登録する
 * （Express の仕様上、エラーハンドラはルートの後に登録する必要がある）
 */
export const attachUnhandledExceptionHandler = (app: express.Express): void => {
  app.use(unhandledExceptionHandler)
}

/**
 * テスト用ユーザーをDBに作成し、JWTトークンを返す
 * 認証必須のAPIテストで、リクエスト前に呼び出して使用する
 */
export const createTestUser = async (overrides?: {
  avatarUrl?: string
  canPublicRanking?: boolean
  displayName?: string
  email?: string
}): Promise<{ token: string; user: User }> => {
  const prismaUser = await testPrisma.user.create({
    data: {
      avatarUrl: overrides?.avatarUrl ?? "https://example.com/avatar.jpg",
      canPublicRanking: overrides?.canPublicRanking ?? true,
      displayName: overrides?.displayName ?? "Test User",
      email: overrides?.email ?? `test-${Date.now()}@example.com`,
    },
  })

  const user: User = {
    avatarUrl: prismaUser.avatarUrl,
    canPublicRanking: prismaUser.canPublicRanking,
    createdAt: prismaUser.createdAt,
    displayName: prismaUser.displayName,
    email: prismaUser.email,
    favoriteRepoUrl: prismaUser.favoriteRepoUrl,
    id: prismaUser.id,
    updatedAt: prismaUser.updatedAt,
  }

  const token = generateAccessToken(user.id)

  return { token, user }
}
