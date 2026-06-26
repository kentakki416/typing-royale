import request from "supertest"

import { UserGetController } from "../../../src/controller/user/get"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaUserLifetimeStatsRepository } from "../../../src/repository/prisma/user-lifetime-stats-repository"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const userLifetimeStatsRepository = new PrismaUserLifetimeStatsRepository(testPrisma)

const app = createTestApp()

const userGetController = new UserGetController(userRepository, userLifetimeStatsRepository)

app.use("/api/user", userRouter({ get: userGetController }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/user", () => {
  describe("正常系", () => {
    it("認証済みユーザーの場合、200 とユーザー情報を返す", async () => {
      const user = await testPrisma.user.create({
        data: {
          avatarUrl: "https://example.com/avatar.jpg",
          githubUsername: "Test User",
          email: "test@example.com",
        },
      })

      const token = generateAccessToken(user.id)

      const res = await request(app)
        .get("/api/user")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        avatar_url: "https://example.com/avatar.jpg",
        can_public_ranking: true,
        created_at: expect.any(String),
        github_username: "Test User",
        email: "test@example.com",
        favorite_repo_url: null,
        id: user.id,
        weak_chars: [],
      })
    })

    it("生涯統計がある場合、苦手文字 top5 を誤打数降順で返す", async () => {
      const user = await testPrisma.user.create({
        data: { githubUsername: "weakchar", email: "weak@example.com" },
      })
      await testPrisma.userLifetimeStats.create({
        data: {
          userId: user.id,
          lifetimeMistypeStats: { a: 3, e: 9, l: 7, p: 1, s: 5, t: 12 },
        },
      })

      const token = generateAccessToken(user.id)
      const res = await request(app)
        .get("/api/user")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      // 誤打数降順で top5（p:1 は 6 番目なので除外）
      expect(res.body.weak_chars).toEqual([
        { char: "t", count: 12 },
        { char: "e", count: 9 },
        { char: "l", count: 7 },
        { char: "s", count: 5 },
        { char: "a", count: 3 },
      ])
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しない場合、404 を返す", async () => {
      const token = generateAccessToken(999999)

      const res = await request(app)
        .get("/api/user")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).get("/api/user")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("無効なトークンの場合、401 を返す", async () => {
      const res = await request(app)
        .get("/api/user")
        .set("Authorization", "Bearer invalid-token")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
