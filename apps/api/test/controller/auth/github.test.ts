import request from "supertest"

import { GithubUserInfo, IGithubOAuthClient } from "../../../src/client/github-oauth"
import { AuthGithubController } from "../../../src/controller/auth/github"
import { verifyRefreshToken } from "../../../src/lib/jwt"
import { PrismaAuthAccountRepository } from "../../../src/repository/prisma/auth-account-repository"
import { PrismaTransactionRunner } from "../../../src/repository/prisma/transaction-runner"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { IoRedisRefreshTokenRepository } from "../../../src/repository/redis"
import { authRouter } from "../../../src/routes/auth-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testRedis,
} from "../setup"

const mockGetUserInfo = vi.fn<(_0: string, _1: string) => Promise<GithubUserInfo>>()
const mockGithubOAuthClient: IGithubOAuthClient = {
  getUserInfo: mockGetUserInfo,
}

const authAccountRepository = new PrismaAuthAccountRepository(testPrisma)
const userRepository = new PrismaUserRepository(testPrisma)
const transactionRunner = new PrismaTransactionRunner(testPrisma)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)

const app = createTestApp()

const authGithubController = new AuthGithubController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
  mockGithubOAuthClient,
)

app.use("/api/auth", authRouter({ github: authGithubController }))
attachUnhandledExceptionHandler(app)

const REDIRECT_URI = "http://localhost:3000/api/auth/callback/github"

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  vi.clearAllMocks()
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/auth/github", () => {
  describe("正常系", () => {
    it("新規ユーザーの場合、200 と Access/Refresh Token を返し、DB にユーザーが作成され Redis に Refresh Token が保存される", async () => {
      mockGetUserInfo.mockResolvedValue({
        avatarUrl: "https://avatars.githubusercontent.com/u/100?v=4",
        id: "100",
        login: "newoctocat",
        name: "New Octo",
      })

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        access_token: expect.any(String),
        is_new_user: true,
        refresh_token: expect.any(String),
        user: {
          avatar_url: "https://avatars.githubusercontent.com/u/100?v=4",
          can_public_ranking: true,
          created_at: expect.any(String),
          display_name: "New Octo",
          email: null,
          id: expect.any(Number),
        },
      })

      /** Postgres に User が作成され、AuthAccount が紐付いている */
      const createdAuthAccount = await testPrisma.authAccount.findFirst({
        include: { user: true },
        where: { provider: "github", providerAccountId: "100" },
      })
      expect(createdAuthAccount?.user).toMatchObject({
        avatarUrl: "https://avatars.githubusercontent.com/u/100?v=4",
        canPublicRanking: true,
        displayName: "New Octo",
      })

      /** Redis に Refresh Token が保存されている */
      const payload = verifyRefreshToken(res.body.refresh_token)
      expect(payload).not.toBeNull()
      expect(await refreshTokenRepository.findUserId(payload!.jti)).toBe(createdAuthAccount!.userId)
    })

    it("name が null の場合、login を displayName に採用する", async () => {
      mockGetUserInfo.mockResolvedValue({
        avatarUrl: null,
        id: "200",
        login: "anonyoct",
        name: null,
      })

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(200)
      expect(res.body.user).toMatchObject({
        avatar_url: null,
        display_name: "anonyoct",
      })
    })

    it("既存ユーザーの場合、200 と is_new_user=false を返す", async () => {
      const user = await testPrisma.user.create({
        data: {
          avatarUrl: "https://avatars.githubusercontent.com/u/300?v=4",
          displayName: "Existing Oct",
        },
      })
      await testPrisma.authAccount.create({
        data: {
          provider: "github",
          providerAccountId: "300",
          userId: user.id,
        },
      })

      mockGetUserInfo.mockResolvedValue({
        avatarUrl: "https://avatars.githubusercontent.com/u/300?v=4",
        id: "300",
        login: "existingoct",
        name: "Existing Oct",
      })

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        access_token: expect.any(String),
        is_new_user: false,
        refresh_token: expect.any(String),
        user: {
          avatar_url: "https://avatars.githubusercontent.com/u/300?v=4",
          can_public_ranking: true,
          created_at: expect.any(String),
          display_name: "Existing Oct",
          email: null,
          id: user.id,
        },
      })
    })
  })

  describe("異常系", () => {
    it("code が無い場合、400 を返す", async () => {
      const res = await request(app)
        .post("/api/auth/github")
        .send({ redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("redirect_uri が URL でない場合、400 を返す", async () => {
      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", redirect_uri: "not-a-url" })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("GitHub 認証エラー時、グローバルエラーハンドラが 500 を返す", async () => {
      mockGetUserInfo.mockRejectedValue(new Error("GitHub authentication failed"))

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "invalid-code", redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 500 })
    })
  })
})
