import request from "supertest"

import { HallOfFameListController } from "../../../src/controller/hall-of-fame/list"
import {
  PrismaLanguageRepository,
  PrismaUserLanguageBestRepository,
} from "../../../src/repository/prisma"
import { hallOfFameRouter } from "../../../src/routes/hall-of-fame-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const languageRepository = new PrismaLanguageRepository(testPrisma)
const userLanguageBestRepository = new PrismaUserLanguageBestRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/hall-of-fame",
  hallOfFameRouter({
    list: new HallOfFameListController(
      languageRepository,
      userLanguageBestRepository,
    ),
  }),
)
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
})

/**
 * language + 任意人数の user + crawled_repo + play_session + user_language_best を seed
 */
const seedRanking = async (
  entries: Array<{ displayName: string; score: number }>,
) => {
  const language = await testPrisma.language.create({
    data: { name: "TypeScript", slug: "typescript" },
  })
  const repo = await testPrisma.crawledRepo.create({
    data: {
      candidatesCount: 30,
      commitSha: "abc123",
      crawledAt: new Date(),
      defaultBranch: "main",
      description: "Test repo",
      fullName: "owner/repo",
      githubId: BigInt(123456),
      languageId: language.id,
      license: "MIT",
      name: "repo",
      owner: "owner",
      stars: 1500,
      storedCount: 30,
      topics: ["typescript"],
    },
  })

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const user = await testPrisma.user.create({
      data: {
        canPublicRanking: true,
        displayName: e.displayName,
        email: `u${i}@example.com`,
      },
    })
    const session = await testPrisma.playSession.create({
      data: {
        accuracy: 0.95,
        crawledRepoId: repo.id,
        languageId: language.id,
        mistypeStats: {},
        mode: "solo",
        playedAt: new Date(),
        problemsCompleted: 1,
        problemsPlayed: 1,
        score: e.score,
        typedChars: e.score,
        userId: user.id,
      },
    })
    await testPrisma.userLanguageBest.create({
      data: {
        accuracy: 0.95,
        bestPlaySessionId: session.id,
        languageId: language.id,
        playedAt: new Date(),
        score: e.score,
        typedChars: e.score,
        userId: user.id,
      },
    })
  }
  return { language, repo }
}

describe("GET /api/hall-of-fame", () => {
  describe("正常系", () => {
    it("TOP 10 を rank 順で返す", async () => {
      await seedRanking([
        { displayName: "u1", score: 800 },
        { displayName: "u2", score: 600 },
        { displayName: "u3", score: 400 },
      ])

      const res = await request(app).get("/api/hall-of-fame").query({ language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body.language).toBe("typescript")
      expect(res.body.entries.map((e: { rank: number; score: number }) => ({
        rank: e.rank,
        score: e.score,
      }))).toEqual([
        { rank: 1, score: 800 },
        { rank: 2, score: 600 },
        { rank: 3, score: 400 },
      ])
    })

    it("entry が無くても空配列で 200", async () => {
      await testPrisma.language.create({ data: { name: "TypeScript", slug: "typescript" } })

      const res = await request(app).get("/api/hall-of-fame").query({ language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ entries: [], language: "typescript" })
    })
  })

  describe("異常系", () => {
    it("不正な language で 404", async () => {
      const res = await request(app).get("/api/hall-of-fame").query({ language: "python" })

      expect(res.status).toBe(404)
    })

    it("language 未指定で 400", async () => {
      const res = await request(app).get("/api/hall-of-fame")

      expect(res.status).toBe(400)
    })
  })
})
