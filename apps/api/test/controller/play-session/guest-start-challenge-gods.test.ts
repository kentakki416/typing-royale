import request from "supertest"

import { PlaySessionGuestStartChallengeGodsController } from "../../../src/controller/play-session/guest-start-challenge-gods"
import {
  PrismaKeystrokeLogRepository,
  PrismaLanguageRepository,
  PrismaPlaySessionRepository,
  PrismaProblemRepository,
  PrismaRankingSnapshotRepository,
} from "../../../src/repository/prisma"
import { playSessionRouter } from "../../../src/routes/play-session-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
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
const rankingSnapshotRepository = new PrismaRankingSnapshotRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/play-sessions",
  playSessionRouter({
    guestStartChallengeGods: new PlaySessionGuestStartChallengeGodsController(
      keystrokeLogRepository,
      languageRepository,
      playSessionRepository,
      problemRepository,
      rankingSnapshotRepository,
    ),
  }),
)
attachUnhandledExceptionHandler(app)

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

describe("POST /api/play-sessions/guest/challenge-gods", () => {
  describe("異常系", () => {
    it("language_id が無い場合、400 を返す", async () => {
      const res = await request(app)
        .post("/api/play-sessions/guest/challenge-gods")
        .send({})

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("存在しない language_id の場合、400 を返す", async () => {
      const res = await request(app)
        .post("/api/play-sessions/guest/challenge-gods")
        .send({ language_id: 99999 })

      expect(res.status).toBe(400)
    })

    it("トップ 10 不在の場合、409 を返す（プレイヤーが誰もスコアを残していない状態）", async () => {
      const language = await testPrisma.language.create({ data: { name: "TypeScript", slug: "typescript" } })

      const res = await request(app)
        .post("/api/play-sessions/guest/challenge-gods")
        .send({ language_id: language.id })

      expect(res.status).toBe(409)
    })

    it("Redis にステートが書き込まれないこと（ステートレス）", async () => {
      const language = await testPrisma.language.create({ data: { name: "TypeScript", slug: "typescript" } })

      await request(app)
        .post("/api/play-sessions/guest/challenge-gods")
        .send({ language_id: language.id })

      /** 成功・失敗いずれの場合も Redis に play_session: は書かれない */
      const keys = await testRedis.keys("play_session:*")
      expect(keys).toEqual([])
    })
  })
})
