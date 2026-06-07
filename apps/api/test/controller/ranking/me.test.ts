import request from "supertest"

import { RankingMeController } from "../../../src/controller/ranking/me"
import {
  PrismaLanguageRepository,
  PrismaUserLanguageBestRepository,
  PrismaUserLifetimeStatsRepository,
} from "../../../src/repository/prisma"
import { rankingRouter } from "../../../src/routes/ranking-router"
import { attachErrorHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const languageRepository = new PrismaLanguageRepository(testPrisma)
const userLanguageBestRepository = new PrismaUserLanguageBestRepository(testPrisma)
const userLifetimeStatsRepository = new PrismaUserLifetimeStatsRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/rankings",
  rankingRouter({
    me: new RankingMeController(
      languageRepository,
      userLanguageBestRepository,
      userLifetimeStatsRepository,
    ),
  }),
)
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
})

const seedLanguageAndRepo = async () => {
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
  return { language, repo }
}

const insertBest = async (params: {
  accuracy: number
  languageId: number
  playedAt: Date
  repoId: number
  score: number
  userId: number
}) => {
  const session = await testPrisma.playSession.create({
    data: {
      accuracy: params.accuracy,
      crawledRepoId: params.repoId,
      languageId: params.languageId,
      mistypeStats: {},
      mode: "solo",
      playedAt: params.playedAt,
      problemsCompleted: 5,
      problemsPlayed: 6,
      score: params.score,
      typedChars: params.score,
      userId: params.userId,
    },
  })
  await testPrisma.userLanguageBest.create({
    data: {
      accuracy: params.accuracy,
      bestPlaySessionId: session.id,
      languageId: params.languageId,
      playedAt: params.playedAt,
      score: params.score,
      typedChars: params.score,
      userId: params.userId,
    },
  })
  return session
}

describe("GET /api/rankings/me", () => {
  describe("正常系", () => {
    it("ベスト未保存なら rank=null / best_*=null / grade=Intern を返す", async () => {
      await seedLanguageAndRepo()
      const { token } = await createTestUser()

      const res = await request(app)
        .get("/api/rankings/me")
        .query({ language: "typescript" })
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        best_accuracy: null,
        best_play_session_id: null,
        best_played_at: null,
        best_score: null,
        grade: { level: 1, name: "Intern", slug: "intern" },
        language: "typescript",
        next_grade: { level: 2, name: "Junior Developer", score_needed: 100, slug: "junior" },
        rank: null,
        total_ranked_players: 0,
      })
    })

    it("ベストありなら自分より上位の数 + 1 を rank として返し、grade は user_lifetime_stats.bestScore で判定する", async () => {
      const { language, repo } = await seedLanguageAndRepo()
      const { token, user } = await createTestUser()

      /** 上位 2 人 */
      const top1 = await testPrisma.user.create({ data: { displayName: "top1", email: "t1@example.com" } })
      const top2 = await testPrisma.user.create({ data: { displayName: "top2", email: "t2@example.com" } })
      await insertBest({ accuracy: 0.99, languageId: language.id, playedAt: new Date("2026-05-01"), repoId: repo.id, score: 900, userId: top1.id })
      await insertBest({ accuracy: 0.98, languageId: language.id, playedAt: new Date("2026-05-10"), repoId: repo.id, score: 800, userId: top2.id })

      /** 自分（3 位想定） */
      await insertBest({
        accuracy: 0.97,
        languageId: language.id,
        playedAt: new Date("2026-06-03T05:43:21Z"),
        repoId: repo.id,
        score: 732,
        userId: user.id,
      })
      await testPrisma.userLifetimeStats.create({
        data: { bestScore: 732, currentGrade: "staff", userId: user.id },
      })

      const res = await request(app)
        .get("/api/rankings/me")
        .query({ language: "typescript" })
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        best_accuracy: 0.97,
        best_play_session_id: expect.any(Number),
        best_played_at: "2026-06-03T05:43:21.000Z",
        best_score: 732,
        grade: { level: 5, name: "Staff Engineer", slug: "staff" },
        language: "typescript",
        /** 732 → 次 Principal(800) まで 68pt */
        next_grade: { level: 6, name: "Principal Engineer", score_needed: 68, slug: "principal" },
        rank: 3,
        total_ranked_players: 3,
      })
    })

    it("canPublicRanking=false のユーザー自身も自分の順位は見れる（total_ranked_players には含まれない）", async () => {
      const { language, repo } = await seedLanguageAndRepo()
      const { token, user } = await createTestUser({ canPublicRanking: false })

      /** 公開ユーザー 1 人 */
      const pub = await testPrisma.user.create({ data: { displayName: "pub", email: "pub@example.com" } })
      await insertBest({ accuracy: 0.95, languageId: language.id, playedAt: new Date("2026-05-01"), repoId: repo.id, score: 1000, userId: pub.id })

      /** 自分（非公開） */
      await insertBest({
        accuracy: 0.97,
        languageId: language.id,
        playedAt: new Date("2026-06-03"),
        repoId: repo.id,
        score: 500,
        userId: user.id,
      })

      const res = await request(app)
        .get("/api/rankings/me")
        .query({ language: "typescript" })
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      /** 公開ユーザー 1 人だけが上位 → rank=2、total_ranked_players は公開のみカウント */
      expect(res.body.rank).toBe(2)
      expect(res.body.total_ranked_players).toBe(1)
      expect(res.body.best_score).toBe(500)
    })
  })

  describe("異常系", () => {
    it("認証なしの場合、401 を返す", async () => {
      await seedLanguageAndRepo()

      const res = await request(app)
        .get("/api/rankings/me")
        .query({ language: "typescript" })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("不正な language で 404", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .get("/api/rankings/me")
        .query({ language: "python" })
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
    })

    it("language 未指定の場合、400", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .get("/api/rankings/me")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
    })
  })
})
