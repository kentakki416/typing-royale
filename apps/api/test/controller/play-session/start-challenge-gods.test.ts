import request from "supertest"

import { PlaySessionStartChallengeGodsController } from "../../../src/controller/play-session/start-challenge-gods"
import {
  PrismaKeystrokeLogRepository,
  PrismaLanguageRepository,
  PrismaPlaySessionRepository,
  PrismaProblemRepository,
  PrismaRankingSnapshotRepository,
} from "../../../src/repository/prisma"
import { IoRedisPlaySessionStateRepository } from "../../../src/repository/redis"
import { playSessionRouter } from "../../../src/routes/play-session-router"
import { attachErrorHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testRedis,
} from "../setup"

const languageRepository = new PrismaLanguageRepository(testPrisma)
const playSessionRepository = new PrismaPlaySessionRepository(testPrisma)
const keystrokeLogRepository = new PrismaKeystrokeLogRepository(testPrisma)
const problemRepository = new PrismaProblemRepository(testPrisma)
const playSessionStateRepository = new IoRedisPlaySessionStateRepository(testRedis)
const rankingSnapshotRepository = new PrismaRankingSnapshotRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/play-sessions",
  playSessionRouter({
    startChallengeGods: new PlaySessionStartChallengeGodsController(
      keystrokeLogRepository,
      languageRepository,
      playSessionRepository,
      playSessionStateRepository,
      problemRepository,
      rankingSnapshotRepository,
    ),
  }),
)
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/play-sessions/challenge-gods", () => {
  describe("異常系", () => {
    it("認証なしの場合、401 を返す", async () => {
      const language = await testPrisma.language.create({ data: { name: "TypeScript", slug: "typescript" } })

      const res = await request(app)
        .post("/api/play-sessions/challenge-gods")
        .send({ language_id: language.id })

      expect(res.status).toBe(401)
    })

    it("language_id が無い場合、400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/challenge-gods")
        .set("Authorization", `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
    })

    it("存在しない language_id の場合、400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/challenge-gods")
        .set("Authorization", `Bearer ${token}`)
        .send({ language_id: 99999 })

      expect(res.status).toBe(400)
    })

    it("user_language_best が空の場合、候補が見つからず 409 Conflict を返す", async () => {
      /**
       * 本 PR で StubRankingSnapshotRepository は削除済み。Prisma 実装が
       * user_language_best を読むため、テーブルが空なら候補なしで 409 になる
       */
      const language = await testPrisma.language.create({ data: { name: "TypeScript", slug: "typescript" } })
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/challenge-gods")
        .set("Authorization", `Bearer ${token}`)
        .send({ language_id: language.id })

      expect(res.status).toBe(409)
    })
  })
})
