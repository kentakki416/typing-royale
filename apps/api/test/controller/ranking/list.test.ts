import request from "supertest"

import { RankingListController } from "../../../src/controller/ranking/list"
import {
  PrismaLanguageRepository,
  PrismaUserLanguageBestRepository,
} from "../../../src/repository/prisma"
import { rankingRouter } from "../../../src/routes/ranking-router"
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
  "/api/rankings",
  rankingRouter({
    list: new RankingListController(languageRepository, userLanguageBestRepository),
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
 * languages + 任意人数分の user + crawled_repo + play_session + user_language_best を seed
 */
const seedRanking = async (entries: Array<{
  accuracy: number
  canPublicRanking?: boolean
  displayName: string
  playedAt: Date
  score: number
}>) => {
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

  const created: Array<{ score: number; userId: number }> = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const user = await testPrisma.user.create({
      data: {
        canPublicRanking: e.canPublicRanking ?? true,
        displayName: e.displayName,
        email: `u${i}@example.com`,
      },
    })
    const session = await testPrisma.playSession.create({
      data: {
        accuracy: e.accuracy,
        crawledRepoId: repo.id,
        languageId: language.id,
        mistypeStats: {},
        mode: "solo",
        playedAt: e.playedAt,
        problemsCompleted: 5,
        problemsPlayed: 6,
        score: e.score,
        typedChars: e.score,
        userId: user.id,
      },
    })
    await testPrisma.userLanguageBest.create({
      data: {
        accuracy: e.accuracy,
        bestPlaySessionId: session.id,
        languageId: language.id,
        playedAt: e.playedAt,
        score: e.score,
        typedChars: e.score,
        userId: user.id,
      },
    })
    created.push({ score: e.score, userId: user.id })
  }
  return { language, repo, users: created }
}

describe("GET /api/rankings", () => {
  describe("正常系", () => {
    it("score 降順で TOP 10 を返し、rank が 1..N で振られる", async () => {
      await seedRanking([
        { accuracy: 0.95, displayName: "u1", playedAt: new Date("2026-06-01T00:00:00Z"), score: 100 },
        { accuracy: 0.96, displayName: "u2", playedAt: new Date("2026-06-01T00:00:00Z"), score: 150 },
        { accuracy: 0.97, displayName: "u3", playedAt: new Date("2026-06-01T00:00:00Z"), score: 200 },
      ])

      const res = await request(app).get("/api/rankings").query({ language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body.language).toBe("typescript")
      expect(res.body.total_ranked_players).toBe(3)
      expect(res.body.entries.map((e: { rank: number; score: number }) => ({ rank: e.rank, score: e.score }))).toEqual([
        { rank: 1, score: 200 },
        { rank: 2, score: 150 },
        { rank: 3, score: 100 },
      ])
    })

    it("ベスト 0 件なら entries=[] / total_ranked_players=0 で 200", async () => {
      await testPrisma.language.create({ data: { name: "TypeScript", slug: "typescript" } })

      const res = await request(app).get("/api/rankings").query({ language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        entries: [],
        language: "typescript",
        total_ranked_players: 0,
      })
    })

    it("canPublicRanking=false のユーザーは TOP 10 と total_ranked_players の双方から除外される", async () => {
      await seedRanking([
        { accuracy: 0.95, displayName: "public", playedAt: new Date("2026-06-01T00:00:00Z"), score: 100 },
        { accuracy: 0.99, canPublicRanking: false, displayName: "hidden", playedAt: new Date("2026-06-01T00:00:00Z"), score: 999 },
      ])

      const res = await request(app).get("/api/rankings").query({ language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body.total_ranked_players).toBe(1)
      expect(res.body.entries).toHaveLength(1)
      expect(res.body.entries[0].user.display_name).toBe("public")
    })

    it("tie-break: 同 score なら accuracy 降順 → playedAt 昇順で並ぶ", async () => {
      await seedRanking([
        /** 同 score / 同 accuracy → 先に達成した方が上位 */
        { accuracy: 0.95, displayName: "later", playedAt: new Date("2026-06-02T00:00:00Z"), score: 500 },
        { accuracy: 0.95, displayName: "earlier", playedAt: new Date("2026-06-01T00:00:00Z"), score: 500 },
        /** 同 score / 高 accuracy → 1 位 */
        { accuracy: 0.98, displayName: "high_acc", playedAt: new Date("2026-06-05T00:00:00Z"), score: 500 },
      ])

      const res = await request(app).get("/api/rankings").query({ language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body.entries.map((e: { user: { display_name: string } }) => e.user.display_name)).toEqual([
        "high_acc",
        "earlier",
        "later",
      ])
    })
  })

  describe("異常系", () => {
    it("不正な language で 404", async () => {
      const res = await request(app).get("/api/rankings").query({ language: "python" })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("limit が範囲外で 400", async () => {
      await testPrisma.language.create({ data: { name: "TypeScript", slug: "typescript" } })

      const res = await request(app).get("/api/rankings").query({ language: "typescript", limit: 999 })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })
  })
})
