import request from "supertest"

import { HallOfFameListController } from "../../../src/controller/hall-of-fame/list"
import {
  PrismaHallOfFameEntryRepository,
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

const hallOfFameEntryRepository = new PrismaHallOfFameEntryRepository(testPrisma)
const languageRepository = new PrismaLanguageRepository(testPrisma)
const userLanguageBestRepository = new PrismaUserLanguageBestRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/hall-of-fame",
  hallOfFameRouter({
    list: new HallOfFameListController(
      hallOfFameEntryRepository,
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
const seedRankingWithComments = async (
  entries: Array<{ comment?: string; displayName: string; score: number }>,
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
    if (e.comment !== undefined) {
      await testPrisma.hallOfFameEntry.create({
        data: {
          bestPlaySessionId: session.id,
          comment: e.comment,
          commentSubmittedAt: new Date(),
          languageId: language.id,
          userId: user.id,
        },
      })
    }
  }
  return { language, repo }
}

describe("GET /api/hall-of-fame", () => {
  describe("正常系", () => {
    it("TOP 10 + コメントを rank 順で返す", async () => {
      await seedRankingWithComments([
        { comment: "1 位の感想", displayName: "u1", score: 800 },
        { displayName: "u2", score: 600 },
        { comment: "3 位コメント", displayName: "u3", score: 400 },
      ])

      const res = await request(app).get("/api/hall-of-fame").query({ language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body.language).toBe("typescript")
      expect(res.body.entries.map((e: { rank: number; score: number; comment: string | null }) => ({
        comment: e.comment,
        rank: e.rank,
        score: e.score,
      }))).toEqual([
        { comment: "1 位の感想", rank: 1, score: 800 },
        { comment: null, rank: 2, score: 600 },
        { comment: "3 位コメント", rank: 3, score: 400 },
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
