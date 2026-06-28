import request from "supertest"

import { PlayerDetailController } from "../../../src/controller/player/detail"
import {
  PrismaUserLanguageBestRepository,
  PrismaUserLifetimeStatsRepository,
  PrismaUserRepository,
} from "../../../src/repository/prisma"
import { playerRouter } from "../../../src/routes/player-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const userLifetimeStatsRepository = new PrismaUserLifetimeStatsRepository(testPrisma)
const userLanguageBestRepository = new PrismaUserLanguageBestRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/players",
  playerRouter({
    detail: new PlayerDetailController(
      userLanguageBestRepository,
      userLifetimeStatsRepository,
      userRepository,
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

const insertBestForUser = async (params: {
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
      problemsCompleted: 1,
      problemsPlayed: 1,
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

describe("GET /api/players/:userId", () => {
  describe("正常系", () => {
    it("公開ユーザーの詳細（user / lifetime_stats / language_bests）を返す", async () => {
      const { language, repo } = await seedLanguageAndRepo()
      const user = await testPrisma.user.create({
        data: {
          avatarUrl: "https://example.com/a.jpg",
          canPublicRanking: true,
          favoriteRepoUrl: "https://github.com/sakurai_dev",
          githubUsername: "sakurai_dev",
          email: "sakurai@example.com",
        },
      })
      await testPrisma.userLifetimeStats.create({
        data: {
          bestScore: 1490,
          currentGrade: "fellow",
          currentGradeReachedAt: new Date("2026-05-12T03:21:11Z"),
          streakDays: 28,
          totalSessions: 142,
          totalTypedChars: BigInt(512847),
          userId: user.id,
        },
      })
      await insertBestForUser({
        accuracy: 0.98,
        languageId: language.id,
        playedAt: new Date("2026-06-03T02:14:08Z"),
        repoId: repo.id,
        score: 1490,
        userId: user.id,
      })

      const res = await request(app).get(`/api/players/${user.id}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        language_bests: [
          {
            accuracy: 0.98,
            best_play_session_id: expect.any(Number),
            language: { id: language.id, name: "TypeScript", slug: "typescript" },
            played_at: "2026-06-03T02:14:08.000Z",
            rank: 1,
            score: 1490,
            typed_chars: 1490,
          },
        ],
        lifetime_stats: {
          best_score: 1490,
          current_grade: { level: 8, name: "Fellow", slug: "fellow" },
          current_grade_reached_at: "2026-05-12T03:21:11.000Z",
          streak_days: 28,
          total_sessions: 142,
          total_typed_chars: 512847,
        },
        user: {
          id: user.id,
          avatar_url: "https://example.com/a.jpg",
          favorite_repo_url: "https://github.com/sakurai_dev",
          github_username: "sakurai_dev",
          joined_at: expect.any(String),
        },
      })
    })

    it("lifetime_stats / language_bests がまだ無いユーザーでも 200 を返し、Intern + 空配列で埋める", async () => {
      const user = await testPrisma.user.create({
        data: { canPublicRanking: true, githubUsername: "newbie", email: "n@example.com" },
      })

      const res = await request(app).get(`/api/players/${user.id}`)

      expect(res.status).toBe(200)
      expect(res.body.lifetime_stats).toEqual({
        best_score: 0,
        current_grade: { level: 1, name: "Intern", slug: "intern" },
        current_grade_reached_at: null,
        streak_days: 0,
        total_sessions: 0,
        total_typed_chars: 0,
      })
      expect(res.body.language_bests).toEqual([])
    })

    it("rank はリアルタイム計算され、他ユーザーが上位にいる場合 2 位以降になる", async () => {
      const { language, repo } = await seedLanguageAndRepo()
      const topUser = await testPrisma.user.create({
        data: { canPublicRanking: true, githubUsername: "top", email: "t@example.com" },
      })
      const targetUser = await testPrisma.user.create({
        data: { canPublicRanking: true, githubUsername: "me", email: "m@example.com" },
      })
      await insertBestForUser({
        accuracy: 0.99,
        languageId: language.id,
        playedAt: new Date("2026-05-01"),
        repoId: repo.id,
        score: 1000,
        userId: topUser.id,
      })
      await insertBestForUser({
        accuracy: 0.95,
        languageId: language.id,
        playedAt: new Date("2026-06-01"),
        repoId: repo.id,
        score: 500,
        userId: targetUser.id,
      })

      const res = await request(app).get(`/api/players/${targetUser.id}`)

      expect(res.status).toBe(200)
      expect(res.body.language_bests).toHaveLength(1)
      expect(res.body.language_bests[0].rank).toBe(2)
    })
  })

  describe("異常系", () => {
    it("canPublicRanking=false のユーザーは 404（存在を識別させない）", async () => {
      const user = await testPrisma.user.create({
        data: { canPublicRanking: false, githubUsername: "hidden", email: "h@example.com" },
      })

      const res = await request(app).get(`/api/players/${user.id}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("存在しない userId は 404", async () => {
      const res = await request(app).get("/api/players/999999")

      expect(res.status).toBe(404)
    })

    it("userId が数値でない場合 400", async () => {
      const res = await request(app).get("/api/players/abc")

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })
  })
})
