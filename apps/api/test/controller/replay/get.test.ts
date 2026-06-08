import { gzipSync } from "node:zlib"

import request from "supertest"

import { ReplayGetController } from "../../../src/controller/replay/get"
import { PrismaKeystrokeLogRepository, PrismaReplayRepository } from "../../../src/repository/prisma"
import { replayRouter } from "../../../src/routes/replay-router"
import { attachErrorHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const keystrokeLogRepository = new PrismaKeystrokeLogRepository(testPrisma)
const replayRepository = new PrismaReplayRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/replays",
  replayRouter({
    get: new ReplayGetController(keystrokeLogRepository, replayRepository),
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

const seedFixture = async (canPublicRanking: boolean, withKeystroke: boolean) => {
  const { user } = await createTestUser({ canPublicRanking, displayName: "Alice" })
  const language = await testPrisma.language.create({
    data: { name: "TypeScript", slug: "typescript" },
  })
  const repo = await testPrisma.crawledRepo.create({
    data: {
      candidatesCount: 0,
      commitSha: "abc",
      crawledAt: new Date(),
      defaultBranch: "main",
      description: "demo",
      fullName: "demo/demo",
      githubId: BigInt(123),
      homepage: null,
      languageId: language.id,
      license: "MIT",
      name: "demo",
      owner: "demo",
      stars: 100,
      storedCount: 0,
      topics: ["demo"],
    },
  })
  const problem = await testPrisma.problem.create({
    data: {
      astHash: "h1",
      charCount: 15,
      codeBlock: "function f() {}",
      crawledRepoId: repo.id,
      functionName: "f",
      languageId: language.id,
      lineCount: 1,
      sourceFilePath: "src/f.ts",
      sourceLineEnd: 1,
      sourceLineStart: 1,
      sourceUrl: "https://example.com/f.ts",
    },
  })
  const session = await testPrisma.playSession.create({
    data: {
      accuracy: 0.95,
      crawledRepoId: repo.id,
      languageId: language.id,
      mistypeStats: {},
      mode: "solo",
      playedAt: new Date("2026-06-08T00:00:00Z"),
      problemsCompleted: 1,
      problemsPlayed: 1,
      score: 1200,
      typedChars: 1250,
      userId: user.id,
    },
  })
  await testPrisma.playSessionProblem.create({
    data: {
      charsTyped: 15,
      completed: true,
      orderIndex: 0,
      playSessionId: session.id,
      problemId: problem.id,
    },
  })
  if (withKeystroke) {
    const logs = [{ elapsedMs: 1000, inputChar: "a", isCorrect: true, problemIndex: 0 }]
    await testPrisma.keystrokeLog.create({
      data: {
        compressedLog: gzipSync(Buffer.from(JSON.stringify(logs))),
        playSessionId: session.id,
      },
    })
  }
  return { session, user }
}

describe("GET /api/replays/:playSessionId", () => {
  describe("正常系", () => {
    it("200 で player / problems / keystroke_logs / repo_info / stats を返す", async () => {
      const { session } = await seedFixture(true, true)

      const res = await request(app).get(`/api/replays/${session.id}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        keystroke_logs: [
          { elapsed_ms: 1000, input_char: "a", is_correct: true, problem_index: 0 },
        ],
        language: "typescript",
        play_session_id: session.id,
        player: {
          avatar_url: "https://example.com/avatar.jpg",
          current_grade: "intern",
          display_name: "Alice",
          user_id: expect.any(Number),
        },
        problems: [
          {
            char_count: 15,
            code_block: "function f() {}",
            function_name: "f",
            id: expect.any(Number),
            line_count: 1,
            order_index: 0,
            source_url: "https://example.com/f.ts",
          },
        ],
        repo_info: {
          description: "demo",
          homepage: null,
          license: "MIT",
          name: "demo",
          owner: "demo",
          stars: 100,
          topics: ["demo"],
        },
        stats: {
          accuracy: 0.95,
          played_at: "2026-06-08T00:00:00.000Z",
          problems_completed: 1,
          score: 1200,
          typed_chars: 1250,
        },
      })
    })
  })

  describe("異常系", () => {
    it("セッション不在で 404", async () => {
      const res = await request(app).get("/api/replays/99999")
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("プレイヤーが canPublicRanking=false で 404", async () => {
      const { session } = await seedFixture(false, true)

      const res = await request(app).get(`/api/replays/${session.id}`)

      expect(res.status).toBe(404)
    })

    it("keystroke_logs 欠落で 404", async () => {
      const { session } = await seedFixture(true, false)

      const res = await request(app).get(`/api/replays/${session.id}`)

      expect(res.status).toBe(404)
    })

    it("playSessionId が数値でない場合は 400", async () => {
      const res = await request(app).get("/api/replays/abc")
      expect(res.status).toBe(400)
    })
  })
})
