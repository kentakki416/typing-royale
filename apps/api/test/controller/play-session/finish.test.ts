import request from "supertest"

import { PlaySessionFinishController } from "../../../src/controller/play-session/finish"
import { LocalCardStorage } from "../../../src/lib/card-storage"
import {
  PrismaKeystrokeLogRepository,
  PrismaMonthlyRankingSnapshotRepository,
  PrismaPlaySessionProblemRepository,
  PrismaPlaySessionRepository,
  PrismaProblemRepository,
  PrismaRewardRepository,
  PrismaTransactionRunner,
  PrismaUserLanguageBestRepository,
  PrismaUserLifetimeStatsRepository,
  PrismaUserRepository,
} from "../../../src/repository/prisma"
import { IoRedisPlaySessionStateRepository } from "../../../src/repository/redis"
import { playSessionRouter } from "../../../src/routes/play-session-router"
import { PlaySessionState } from "../../../src/types/domain"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
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
const userLanguageBestRepository = new PrismaUserLanguageBestRepository(testPrisma)
const userRepository = new PrismaUserRepository(testPrisma)
const monthlyRankingSnapshotRepository = new PrismaMonthlyRankingSnapshotRepository(testPrisma)
const rewardRepository = new PrismaRewardRepository(testPrisma)
const transactionRunner = new PrismaTransactionRunner(testPrisma)
const playSessionStateRepository = new IoRedisPlaySessionStateRepository(testRedis)
/**
 * 達成カード PNG ストレージ (test では /tmp 配下)
 */
const cardStorage = new LocalCardStorage("/tmp/typing-royale-rewards-test", "/cache/rewards")

const app = createTestApp()
app.use(
  "/api/play-sessions",
  playSessionRouter({
    finish: new PlaySessionFinishController(
      cardStorage,
      keystrokeLogRepository,
      monthlyRankingSnapshotRepository,
      playSessionProblemRepository,
      playSessionRepository,
      playSessionStateRepository,
      problemRepository,
      rewardRepository,
      transactionRunner,
      userLanguageBestRepository,
      userLifetimeStatsRepository,
      userRepository,
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
        best_score_updated: true,
        /** score=3 は Intern (threshold=0) のまま → grade_up=null（Intern→Intern は通知しない） */
        grade_up: null,
        mistype_stats: {},
        /** monthly snapshot も 1 件しか無いので boundary=null（10 件未満 = 誰でも入賞） */
        monthly_top_ten_boundary_score: null,
        new_rank: 1,
        persisted: true,
        problems_completed: 1,
        problems_played: 1,
        score: 3,
        /** ベスト 1 件しか無いので 10 位は null */
        top_ten_boundary_score: null,
        /** ベスト 1 件しかランクインしていないので total=1 */
        total_ranked_players: 1,
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
       * （score-ranking step3 で currentGrade も書き込まれる）
       */
      const stats = await testPrisma.userLifetimeStats.findUnique({ where: { userId: user.id } })
      expect(stats).toMatchObject({
        bestScore: 3,
        /** score=3 は Intern (threshold=0) のまま */
        currentGrade: "intern",
        currentGradeReachedAt: null,
        totalSessions: 1,
        totalTypedChars: BigInt(3),
        userId: user.id,
      })

      /**
       * user_language_best が新規 upsert で 1 行作成されている（score-ranking step3）
       */
      const language = await testPrisma.language.findFirstOrThrow()
      const best = await testPrisma.userLanguageBest.findUnique({
        where: { userId_languageId: { languageId: language.id, userId: user.id } },
      })
      expect(best).toMatchObject({
        accuracy: 1,
        bestPlaySessionId: playSessions[0].id,
        languageId: language.id,
        score: 3,
        typedChars: 3,
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
      /** score-ranking step3: 2 回目で best 更新されたので best_score_updated=true */
      expect(res.body.best_score_updated).toBe(true)
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

      /**
       * user_language_best も 2 回目セッションを指すように更新されている
       */
      const playSessions = await testPrisma.playSession.findMany({
        orderBy: { id: "asc" },
        where: { userId: user.id },
      })
      const best = await testPrisma.userLanguageBest.findUnique({
        where: { userId_languageId: { languageId: language!.id, userId: user.id } },
      })
      expect(best).toMatchObject({
        bestPlaySessionId: playSessions[1].id,
        score: 6,
      })
    })

    it("2 回目のスコアが既存ベスト以下なら user_language_best は据置（best_score_updated=false）", async () => {
      // Arrange: 1 回目 (score=6)
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
            { elapsed_ms: 400, input_char: "d", is_correct: true, problem_index: 1 },
            { elapsed_ms: 500, input_char: "e", is_correct: true, problem_index: 1 },
            { elapsed_ms: 600, input_char: "f", is_correct: true, problem_index: 1 },
          ],
          typed_chars: 6,
        })

      const language = await testPrisma.language.findFirstOrThrow()
      const firstBest = await testPrisma.userLanguageBest.findUniqueOrThrow({
        where: { userId_languageId: { languageId: language.id, userId: user.id } },
      })

      // 2 回目: より低い score (3)
      const sessionId2 = "550e8400-e29b-41d4-a716-446655440002"
      const crawledRepo = await testPrisma.crawledRepo.findFirstOrThrow()
      await playSessionStateRepository.save(
        sessionId2,
        {
          crawledRepoId: crawledRepo.id,
          ghostSessionId: null,
          languageId: language.id,
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
          ],
          typed_chars: 3,
        })

      // Assert
      expect(res.status).toBe(200)
      expect(res.body.best_score_updated).toBe(false)
      expect(res.body.new_rank).toBe(1)

      const bestAfter = await testPrisma.userLanguageBest.findUniqueOrThrow({
        where: { userId_languageId: { languageId: language.id, userId: user.id } },
      })
      /** user_language_best は据置（1 回目の score=6 / bestPlaySessionId のまま） */
      expect(bestAfter.score).toBe(6)
      expect(bestAfter.bestPlaySessionId).toBe(firstBest.bestPlaySessionId)
    })

    /**
     * グローバル testTimeout=3000ms に対して、本テストは
     * - 110 件の keystroke log を含む /finish 呼び出し
     * - 5 テーブル atomic transaction
     * - 達成カード PNG 生成（@resvg/resvg-js による SVG → PNG 変換、CI ランナーで特に重い）
     * を含むため CI でフレイクしやすい。本テスト単体で 10 秒に延長する。
     */
    it("グレード閾値を跨ぐスコアで grade_up が返り、user_lifetime_stats.currentGrade が更新される", async () => {
      // Arrange: 既存ベスト 50 / Intern を seed
      const { problems, sessionId, token, user } = await seedFinishContext()
      const language = await testPrisma.language.findFirstOrThrow()
      const crawledRepo = await testPrisma.crawledRepo.findFirstOrThrow()

      const dummySession = await testPrisma.playSession.create({
        data: {
          accuracy: 0.9,
          crawledRepoId: crawledRepo.id,
          languageId: language.id,
          mistypeStats: {},
          mode: "solo",
          playedAt: new Date("2026-05-01"),
          problemsCompleted: 1,
          problemsPlayed: 1,
          score: 50,
          typedChars: 50,
          userId: user.id,
        },
      })
      await testPrisma.userLifetimeStats.create({
        data: {
          bestScore: 50,
          currentGrade: "intern",
          totalSessions: 1,
          totalTypedChars: BigInt(50),
          userId: user.id,
        },
      })
      await testPrisma.userLanguageBest.create({
        data: {
          accuracy: 0.9,
          bestPlaySessionId: dummySession.id,
          languageId: language.id,
          playedAt: new Date("2026-05-01"),
          score: 50,
          typedChars: 50,
          userId: user.id,
        },
      })

      /**
       * Redis state は seedFinishContext で 2 問分セットされている。
       * 6 文字 × accuracy=1 → score=6... では junior に届かないので、
       * 110 文字 × accuracy≒1 → score=110 で Intern (0) → Junior (100) を跨がせるための
       * 別アプローチとして state.problemIds を上書きせず、accuracy を高く打鍵数を多くする
       *
       * ここでは seedFinishContext が用意した state を使わず、新たな state を作る:
       */
      const sessionId2 = "550e8400-e29b-41d4-a716-446655440003"
      await playSessionStateRepository.save(
        sessionId2,
        {
          crawledRepoId: crawledRepo.id,
          ghostSessionId: null,
          languageId: language.id,
          mode: "solo",
          problemIds: problems.map((p) => p.id),
          userId: user.id,
        },
        300,
      )
      /** 既存の sessionId は使わないので Redis から削除（テストデータの汚染を避ける） */
      await playSessionStateRepository.delete(sessionId)

      // Act: 110 文字 × accuracy=1 → score=110 (Junior 閾値 100 を跨ぐ)
      const longLog = Array.from({ length: 110 }, (_, i) => ({
        elapsed_ms: 100 + i * 10,
        input_char: i % 3 === 0 ? "a" : i % 3 === 1 ? "b" : "c",
        is_correct: true,
        problem_index: 0,
      }))
      const res = await request(app)
        .post(`/api/play-sessions/${sessionId2}/finish`)
        .set("Authorization", `Bearer ${token}`)
        .send({ accuracy: 1, keystroke_logs: longLog, typed_chars: 110 })

      // Assert
      expect(res.status).toBe(200)
      expect(res.body.best_score_updated).toBe(true)
      expect(res.body.grade_up).toEqual({
        from: { level: 1, name: "Intern", slug: "intern" },
        to: { level: 2, name: "Junior Developer", slug: "junior" },
      })

      const stats = await testPrisma.userLifetimeStats.findUniqueOrThrow({
        where: { userId: user.id },
      })
      expect(stats.bestScore).toBe(110)
      expect(stats.currentGrade).toBe("junior")
      expect(stats.currentGradeReachedAt).not.toBeNull()
    }, 10000)

    /**
     * v2 で導入された monthly_ranking_snapshots の /finish 同期 UPSERT を検証する。
     * リアルタイム反映設計 (cron 廃止) のため、/finish 直後に snapshot が更新されている
     */
    describe("monthly_ranking_snapshots の同期 UPSERT", () => {
      /** 当月の "YYYY-MM" 文字列 (JST) を取得 */
      const currentYearMonth = (): string => {
        const fmt = new Intl.DateTimeFormat("ja-JP", {
          month: "2-digit",
          timeZone: "Asia/Tokyo",
          year: "numeric",
        })
        const parts = Object.fromEntries(
          fmt.formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
        )
        return `${parts.year}-${parts.month}`
      }

      it("当月 snapshot 0 件の状態で finish → 自分の行が 1 件 upsert され boundary=null", async () => {
        const { sessionId, token, user } = await seedFinishContext()

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

        expect(res.status).toBe(200)
        /** 10 件未満なので boundary は null（誰でも入賞判定対象） */
        expect(res.body.monthly_top_ten_boundary_score).toBeNull()

        const language = await testPrisma.language.findFirstOrThrow()
        const rows = await testPrisma.monthlyRankingSnapshot.findMany({
          where: { languageId: language.id, userId: user.id, yearMonth: currentYearMonth() },
        })
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ accuracy: 1, score: 3 })
      })

      it("当月 10 件すでに埋まっており自分のスコアが boundary 超なら、自分の行が入り最下位 1 件が delete される (cap 維持)", async () => {
        const { language, sessionId, token, user } = await seedFinishContext()

        /** 他ユーザー 10 件を score 100..109 (自分は 3 を超える 3 が入って push する設定とは別) で seed */
        const otherUsers = await Promise.all(
          Array.from({ length: 10 }, async (_, i) =>
            testPrisma.user.create({
              data: {
                canPublicRanking: true,
                githubUsername: `other${i}`,
                email: `other${i}@example.com`,
              },
            }),
          ),
        )
        const yearMonth = currentYearMonth()
        await Promise.all(
          otherUsers.map((u, i) =>
            testPrisma.monthlyRankingSnapshot.create({
              data: {
                accuracy: 0.9,
                languageId: language.id,
                playedAt: new Date("2026-06-10T00:00:00Z"),
                /** score 1 (最下位) .. 10 になるよう敢えて低スコアで埋め、自分の 3 が確実に入賞 */
                score: i + 1,
                userId: u.id,
                yearMonth,
              },
            }),
          ),
        )

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

        expect(res.status).toBe(200)
        /** cap 維持: 自分が入って 10 件のまま */
        const total = await testPrisma.monthlyRankingSnapshot.count({
          where: { languageId: language.id, yearMonth },
        })
        expect(total).toBe(10)
        /** 自分の行は存在し score=3 */
        const myRow = await testPrisma.monthlyRankingSnapshot.findUnique({
          where: { yearMonth_languageId_userId: { languageId: language.id, userId: user.id, yearMonth } },
        })
        expect(myRow).toMatchObject({ score: 3 })
        /** 元々最下位だった score=1 (otherUsers[0]) の行が消えている */
        const evicted = await testPrisma.monthlyRankingSnapshot.findUnique({
          where: { yearMonth_languageId_userId: { languageId: language.id, userId: otherUsers[0].id, yearMonth } },
        })
        expect(evicted).toBeNull()
      })

      it("当月 10 件埋まっており自分のスコアが boundary 未満なら snapshot は触らない", async () => {
        const { language, sessionId, token, user } = await seedFinishContext()

        /** 他ユーザー 10 件を score 100..109 で seed → boundary=100、自分の score=3 は入賞しない */
        const otherUsers = await Promise.all(
          Array.from({ length: 10 }, async (_, i) =>
            testPrisma.user.create({
              data: {
                canPublicRanking: true,
                githubUsername: `other${i}`,
                email: `other${i}@example.com`,
              },
            }),
          ),
        )
        const yearMonth = currentYearMonth()
        await Promise.all(
          otherUsers.map((u, i) =>
            testPrisma.monthlyRankingSnapshot.create({
              data: {
                accuracy: 0.95,
                languageId: language.id,
                playedAt: new Date("2026-06-10T00:00:00Z"),
                score: 100 + i,
                userId: u.id,
                yearMonth,
              },
            }),
          ),
        )

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

        expect(res.status).toBe(200)
        /** boundary は 100 (現状の最下位) のまま返る */
        expect(res.body.monthly_top_ten_boundary_score).toBe(100)
        /** 件数は 10 のまま、自分の行は入っていない */
        const total = await testPrisma.monthlyRankingSnapshot.count({
          where: { languageId: language.id, yearMonth },
        })
        expect(total).toBe(10)
        const myRow = await testPrisma.monthlyRankingSnapshot.findUnique({
          where: { yearMonth_languageId_userId: { languageId: language.id, userId: user.id, yearMonth } },
        })
        expect(myRow).toBeNull()
      })
    })
  })

  describe("異常系", () => {
    it("認証なしの場合、401 を返す（ゲストは /guest/finish に分離されているため）", async () => {
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
