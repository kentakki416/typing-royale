import request from "supertest"

import { UserGetController } from "../../../src/controller/user/get"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaPlaySessionRepository } from "../../../src/repository/prisma/play-session-repository"
import { PrismaUserLifetimeStatsRepository } from "../../../src/repository/prisma/user-lifetime-stats-repository"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const userLifetimeStatsRepository = new PrismaUserLifetimeStatsRepository(testPrisma)
const playSessionRepository = new PrismaPlaySessionRepository(testPrisma)

const app = createTestApp()

const userGetController = new UserGetController(userRepository, userLifetimeStatsRepository, playSessionRepository)

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
        avg_accuracy: 0,
        best_repo: null,
        can_public_ranking: true,
        created_at: expect.any(String),
        github_username: "Test User",
        email: "test@example.com",
        favorite_repo_url: null,
        id: user.id,
        weak_chars: [],
      })
    })

    it("生涯統計がある場合、苦手文字を誤打数降順で top10 返す", async () => {
      const user = await testPrisma.user.create({
        data: { githubUsername: "weakchar", email: "weak@example.com" },
      })
      await testPrisma.userLifetimeStats.create({
        data: {
          /** 12 種類 → top10 で count 1,2 の k,l が除外される */
          lifetimeMistypeStats: { a: 12, b: 11, c: 10, d: 9, e: 8, f: 7, g: 6, h: 5, i: 4, j: 3, k: 2, l: 1 },
          userId: user.id,
        },
      })

      const token = generateAccessToken(user.id)
      const res = await request(app)
        .get("/api/user")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.weak_chars).toEqual([
        { char: "a", count: 12 },
        { char: "b", count: 11 },
        { char: "c", count: 10 },
        { char: "d", count: 9 },
        { char: "e", count: 8 },
        { char: "f", count: 7 },
        { char: "g", count: 6 },
        { char: "h", count: 5 },
        { char: "i", count: 4 },
        { char: "j", count: 3 },
      ])
    })

    it("プレイ実績がある場合、平均正確率と平均スコア最高の repo（得意リポジトリ）を返す", async () => {
      const user = await testPrisma.user.create({
        data: { githubUsername: "player", email: "player@example.com" },
      })
      const language = await testPrisma.language.create({
        data: { name: "TypeScript", slug: "typescript" },
      })
      const makeRepo = async (fullName: string, githubId: number) =>
        testPrisma.crawledRepo.create({
          data: {
            candidatesCount: 30,
            commitSha: "abc123",
            crawledAt: new Date(),
            defaultBranch: "main",
            description: "Test repo",
            fullName,
            githubId: BigInt(githubId),
            languageId: language.id,
            license: "MIT",
            name: fullName.split("/")[1],
            owner: fullName.split("/")[0],
            stars: 100,
            storedCount: 30,
            topics: ["typescript"],
          },
        })
      const repoHigh = await makeRepo("owner/high", 1)
      const repoLow = await makeRepo("owner/low", 2)

      const makeSession = async (repoId: number, score: number, accuracy: number) =>
        testPrisma.playSession.create({
          data: {
            accuracy,
            crawledRepoId: repoId,
            languageId: language.id,
            mistypeStats: {},
            mode: "solo",
            playedAt: new Date(),
            problemsCompleted: 5,
            problemsPlayed: 6,
            score,
            typedChars: score,
            userId: user.id,
          },
        })
      /** repoHigh 平均スコア 500、repoLow 平均スコア 100 → 得意は repoHigh */
      await makeSession(repoHigh.id, 600, 0.9)
      await makeSession(repoHigh.id, 400, 1.0)
      await makeSession(repoLow.id, 100, 0.8)

      const token = generateAccessToken(user.id)
      const res = await request(app)
        .get("/api/user")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.best_repo.full_name).toBe("owner/high")
      expect(res.body.best_repo.avg_score).toBeCloseTo(500, 5)
      // (0.9 + 1.0 + 0.8) / 3 = 0.9
      expect(res.body.avg_accuracy).toBeCloseTo(0.9, 5)
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
