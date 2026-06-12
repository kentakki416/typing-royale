import request from "supertest"

import { PlaySessionGuestFinishController } from "../../../src/controller/play-session/guest-finish"
import { PrismaProblemRepository } from "../../../src/repository/prisma"
import { playSessionRouter } from "../../../src/routes/play-session-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
} from "../setup"

const problemRepository = new PrismaProblemRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/play-sessions",
  playSessionRouter({
    guestFinish: new PlaySessionGuestFinishController(problemRepository),
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
 * languages / crawled_repos / problems を seed
 */
const seedProblems = async (codeBlocks: string[]) => {
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
  const problems = await Promise.all(
    codeBlocks.map(async (codeBlock, i) =>
      testPrisma.problem.create({
        data: {
          astHash: `hash${i}`,
          charCount: codeBlock.length,
          codeBlock,
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
  return { language, problems }
}

describe("POST /api/play-sessions/guest/finish", () => {
  describe("正常系", () => {
    it("認証なしでスコア集計が返り、DB には何も書き込まれない", async () => {
      const { problems } = await seedProblems(["abc", "def"])

      const res = await request(app)
        .post("/api/play-sessions/guest/finish")
        .send({
          accuracy: 1,
          keystroke_logs: [
            { elapsed_ms: 100, input_char: "a", is_correct: true, problem_index: 0 },
            { elapsed_ms: 200, input_char: "b", is_correct: true, problem_index: 0 },
            { elapsed_ms: 300, input_char: "c", is_correct: true, problem_index: 0 },
          ],
          problem_ids: [problems[0].id, problems[1].id],
          typed_chars: 3,
        })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        accuracy: 1,
        mistype_stats: {},
        problems_completed: 1,
        problems_played: 1,
        score: 3,
        typed_chars: 3,
      })

      /** DB には play_sessions / user_lifetime_stats / user_language_best が一切作られていない */
      expect(await testPrisma.playSession.count()).toBe(0)
      expect(await testPrisma.userLifetimeStats.count()).toBe(0)
      expect(await testPrisma.userLanguageBest.count()).toBe(0)
    })

    it("誤打鍵が含まれていても mistype_stats が正解期待文字単位で集計される", async () => {
      const { problems } = await seedProblems(["hello"])

      const res = await request(app)
        .post("/api/play-sessions/guest/finish")
        .send({
          accuracy: 0.83,
          keystroke_logs: [
            { elapsed_ms: 100, input_char: "h", is_correct: true, problem_index: 0 },
            { elapsed_ms: 200, input_char: "e", is_correct: true, problem_index: 0 },
            { elapsed_ms: 300, input_char: "l", is_correct: true, problem_index: 0 },
            { elapsed_ms: 400, input_char: "k", is_correct: false, problem_index: 0 },
            { elapsed_ms: 500, input_char: "l", is_correct: true, problem_index: 0 },
            { elapsed_ms: 600, input_char: "o", is_correct: true, problem_index: 0 },
          ],
          problem_ids: [problems[0].id],
          typed_chars: 5,
        })

      expect(res.status).toBe(200)
      /** 「l を打つべきところを k で誤入力」→ 期待文字 "l" を加算 */
      expect(res.body.mistype_stats).toEqual({ l: 1 })
    })
  })

  describe("異常系", () => {
    it("typed_chars=2000 は 400 を返す", async () => {
      const { problems } = await seedProblems(["abc", "def"])

      const res = await request(app)
        .post("/api/play-sessions/guest/finish")
        .send({
          accuracy: 0.5,
          keystroke_logs: [],
          problem_ids: [problems[0].id, problems[1].id],
          typed_chars: 2000,
        })

      expect(res.status).toBe(400)
    })

    it("problem_ids が空配列なら 400 を返す（schema 違反）", async () => {
      const res = await request(app)
        .post("/api/play-sessions/guest/finish")
        .send({
          accuracy: 0.5,
          keystroke_logs: [],
          problem_ids: [],
          typed_chars: 0,
        })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("problem_ids が 20 要素を超えると 400 を返す（schema 違反）", async () => {
      const res = await request(app)
        .post("/api/play-sessions/guest/finish")
        .send({
          accuracy: 0.5,
          keystroke_logs: [],
          problem_ids: Array.from({ length: 21 }, (_, i) => i + 1),
          typed_chars: 0,
        })

      expect(res.status).toBe(400)
    })

    it("存在しない problem_ids を送ると 404 を返す", async () => {
      /** seed なし。DB lookup で件数不一致になる */
      const res = await request(app)
        .post("/api/play-sessions/guest/finish")
        .send({
          accuracy: 1,
          keystroke_logs: [],
          problem_ids: [9000, 9001],
          typed_chars: 0,
        })

      expect(res.status).toBe(404)
    })
  })
})
