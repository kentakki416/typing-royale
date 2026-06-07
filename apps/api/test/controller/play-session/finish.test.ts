import request from "supertest"

import { PlaySessionFinishController } from "../../../src/controller/play-session/finish"
import {
  PrismaKeystrokeLogRepository,
  PrismaPlaySessionProblemRepository,
  PrismaPlaySessionRepository,
  PrismaProblemRepository,
  PrismaTransactionRunner,
  PrismaUserLifetimeStatsRepository,
} from "../../../src/repository/prisma"
import { IoRedisPlaySessionStateRepository } from "../../../src/repository/redis"
import { playSessionRouter } from "../../../src/routes/play-session-router"
import { PlaySessionState } from "../../../src/types/domain"
import { attachErrorHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testRedis,
} from "../setup"

const problemRepository = new PrismaProblemRepository(testPrisma)
const playSessionRepository = new PrismaPlaySessionRepository(testPrisma)
const playSessionProblemRepository = new PrismaPlaySessionProblemRepository(testPrisma)
const keystrokeLogRepository = new PrismaKeystrokeLogRepository(testPrisma)
const userLifetimeStatsRepository = new PrismaUserLifetimeStatsRepository(testPrisma)
const transactionRunner = new PrismaTransactionRunner(testPrisma)
const playSessionStateRepository = new IoRedisPlaySessionStateRepository(testRedis)

const app = createTestApp()
app.use(
  "/api/play-sessions",
  playSessionRouter({
    finish: new PlaySessionFinishController(
      keystrokeLogRepository,
      playSessionProblemRepository,
      playSessionRepository,
      playSessionStateRepository,
      problemRepository,
      transactionRunner,
      userLifetimeStatsRepository,
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

/**
 * /finish が消費する Redis state と DB 問題行を一括 seed
 */
const seedFinishContext = async (overrides?: {
  problemCount?: number
}) => {
  const { token, user } = await createTestUser()
  const language = await testPrisma.language.create({
    data: { name: "TypeScript", slug: "typescript" },
  })
  const crawledRepo = await testPrisma.crawledRepo.create({
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
  const problemCount = overrides?.problemCount ?? 2
  const problems = await Promise.all(
    Array.from({ length: problemCount }, async (_, i) =>
      testPrisma.problem.create({
        data: {
          astHash: `hash${i}`,
          charCount: 3,
          codeBlock: i === 0 ? "abc" : "def",
          crawledRepoId: crawledRepo.id,
          functionName: `f${i}`,
          languageId: language.id,
          lineCount: 1,
          sourceFilePath: `src/f${i}.ts`,
          sourceLineEnd: 1,
          sourceLineStart: 1,
          sourceUrl: `https://github.com/owner/repo/blob/main/src/f${i}.ts#L1`,
        },
      }),
    ),
  )

  const sessionId = "550e8400-e29b-41d4-a716-446655440000"
  const state: PlaySessionState = {
    crawledRepoId: crawledRepo.id,
    ghostSessionId: null,
    languageId: language.id,
    mode: "solo",
    problemIds: problems.map((p) => p.id),
    userId: user.id,
  }
  await playSessionStateRepository.save(sessionId, state, 300)

  return { crawledRepo, language, problems, sessionId, token, user }
}

describe("POST /api/play-sessions/:id/finish", () => {
  describe("正常系", () => {
    it("有効なセッションで 200 と集計値を返し、4 テーブルが埋まる", async () => {
      // Arrange
      const { problems, sessionId, token, user } = await seedFinishContext()

      // Act
      const res = await request(app)
        .post(`/api/play-sessions/${sessionId}/finish`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          accuracy: 1,
          keystroke_logs: [
            { elapsed_ms: 100, input_char: "a", is_correct: true, problem_index: 0 },
            { elapsed_ms: 200, input_char: "b", is_correct: true, problem_index: 0 },
            { elapsed_ms: 300, input_char: "c", is_correct: true, problem_index: 0 },
          ],
          typed_chars: 3,
        })

      // Assert
      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        accuracy: 1,
        mistype_stats: {},
        persisted: true,
        problems_completed: 1,
        problems_played: 1,
        score: 3,
        typed_chars: 3,
      })

      /**
       * play_sessions が 1 件作成されている
       */
      const playSessions = await testPrisma.playSession.findMany({ where: { userId: user.id } })
      expect(playSessions).toHaveLength(1)
      expect(playSessions[0]).toMatchObject({
        accuracy: 1,
        problemsCompleted: 1,
        problemsPlayed: 1,
        score: 3,
        typedChars: 3,
        userId: user.id,
      })

      /**
       * play_session_problems が問題数分作成されている
       */
      const pspRows = await testPrisma.playSessionProblem.findMany({
        orderBy: { orderIndex: "asc" },
        where: { playSessionId: playSessions[0].id },
      })
      expect(pspRows).toHaveLength(problems.length)
      expect(pspRows[0]).toMatchObject({
        charsTyped: 3,
        completed: true,
        orderIndex: 0,
        problemId: problems[0].id,
      })

      /**
       * keystroke_logs が gzip 圧縮 bytea で保存されている
       */
      const klRow = await testPrisma.keystrokeLog.findUnique({
        where: { playSessionId: playSessions[0].id },
      })
      expect(klRow).not.toBeNull()
      expect(klRow!.compressedLog.length).toBeGreaterThan(0)

      /**
       * user_lifetime_stats が初回 upsert で 1 行作成されている
       */
      const stats = await testPrisma.userLifetimeStats.findUnique({ where: { userId: user.id } })
      expect(stats).toMatchObject({
        bestScore: 3,
        totalSessions: 1,
        totalTypedChars: BigInt(3),
        userId: user.id,
      })

      /**
       * Redis state は削除されている
       */
      const state = await playSessionStateRepository.findById(sessionId)
      expect(state).toBeNull()
    })

    it("2 回目プレイで user_lifetime_stats が加算 upsert される", async () => {
      // Arrange: 1 回目
      const { problems, sessionId, token, user } = await seedFinishContext()
      await request(app)
        .post(`/api/play-sessions/${sessionId}/finish`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          accuracy: 1,
          keystroke_logs: [
            { elapsed_ms: 100, input_char: "a", is_correct: true, problem_index: 0 },
            { elapsed_ms: 200, input_char: "b", is_correct: true, problem_index: 0 },
            { elapsed_ms: 300, input_char: "c", is_correct: true, problem_index: 0 },
          ],
          typed_chars: 3,
        })

      /**
       * 2 回目: 同じ user + 別 sessionId + より高い score
       */
      const sessionId2 = "550e8400-e29b-41d4-a716-446655440001"
      const language = await testPrisma.language.findFirst()
      const crawledRepo = await testPrisma.crawledRepo.findFirst()
      await playSessionStateRepository.save(
        sessionId2,
        {
          crawledRepoId: crawledRepo!.id,
          ghostSessionId: null,
          languageId: language!.id,
          mode: "solo",
          problemIds: problems.map((p) => p.id),
          userId: user.id,
        },
        300,
      )

      // Act
      const res = await request(app)
        .post(`/api/play-sessions/${sessionId2}/finish`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          accuracy: 1,
          keystroke_logs: [
            { elapsed_ms: 100, input_char: "a", is_correct: true, problem_index: 0 },
            { elapsed_ms: 200, input_char: "b", is_correct: true, problem_index: 0 },
            { elapsed_ms: 300, input_char: "c", is_correct: true, problem_index: 0 },
            { elapsed_ms: 400, input_char: "d", is_correct: true, problem_index: 1 },
            { elapsed_ms: 500, input_char: "e", is_correct: true, problem_index: 1 },
            { elapsed_ms: 600, input_char: "f", is_correct: true, problem_index: 1 },
          ],
          typed_chars: 6,
        })

      // Assert
      expect(res.status).toBe(200)
      const stats = await testPrisma.userLifetimeStats.findUnique({ where: { userId: user.id } })
      expect(stats).toMatchObject({
        /**
         * 1 回目 (score=3) + 2 回目 (score=6) → bestScore は max(3, 6) = 6
         */
        bestScore: 6,
        totalSessions: 2,
        totalTypedChars: BigInt(9),
        userId: user.id,
      })
    })
  })

  describe("異常系", () => {
    it("認証なしの場合、401 を返す", async () => {
      const res = await request(app)
        .post("/api/play-sessions/550e8400-e29b-41d4-a716-446655440000/finish")
        .send({ accuracy: 1, keystroke_logs: [], typed_chars: 0 })

      expect(res.status).toBe(401)
    })

    it("typed_chars=2000 は 400 を返す", async () => {
      const { sessionId, token } = await seedFinishContext()

      const res = await request(app)
        .post(`/api/play-sessions/${sessionId}/finish`)
        .set("Authorization", `Bearer ${token}`)
        .send({ accuracy: 0.5, keystroke_logs: [], typed_chars: 2000 })

      expect(res.status).toBe(400)
    })

    it("path の id が UUID でないなら 400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/not-a-uuid/finish")
        .set("Authorization", `Bearer ${token}`)
        .send({ accuracy: 0.5, keystroke_logs: [], typed_chars: 100 })

      expect(res.status).toBe(400)
    })

    it("存在しない sessionId は 404 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/550e8400-e29b-41d4-a716-446655440000/finish")
        .set("Authorization", `Bearer ${token}`)
        .send({ accuracy: 0.5, keystroke_logs: [], typed_chars: 100 })

      expect(res.status).toBe(404)
    })

    it("/finish を 2 回叩くと 2 回目は 404（Redis 削除済み）", async () => {
      const { sessionId, token } = await seedFinishContext()
      const body = {
        accuracy: 1,
        keystroke_logs: [
          { elapsed_ms: 100, input_char: "a", is_correct: true, problem_index: 0 },
          { elapsed_ms: 200, input_char: "b", is_correct: true, problem_index: 0 },
          { elapsed_ms: 300, input_char: "c", is_correct: true, problem_index: 0 },
        ],
        typed_chars: 3,
      }

      const res1 = await request(app)
        .post(`/api/play-sessions/${sessionId}/finish`)
        .set("Authorization", `Bearer ${token}`)
        .send(body)
      expect(res1.status).toBe(200)

      const res2 = await request(app)
        .post(`/api/play-sessions/${sessionId}/finish`)
        .set("Authorization", `Bearer ${token}`)
        .send(body)
      expect(res2.status).toBe(404)
    })
  })
})
