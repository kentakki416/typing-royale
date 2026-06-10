import request from "supertest"

import { PlaySessionStartSoloController } from "../../../src/controller/play-session/start-solo"
import {
  PrismaCrawledRepoRepository,
  PrismaLanguageRepository,
  PrismaProblemRepository,
} from "../../../src/repository/prisma"
import { IoRedisPlaySessionStateRepository } from "../../../src/repository/redis"
import { playSessionRouter } from "../../../src/routes/play-session-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testRedis,
} from "../setup"

const languageRepository = new PrismaLanguageRepository(testPrisma)
const crawledRepoRepository = new PrismaCrawledRepoRepository(testPrisma)
const problemRepository = new PrismaProblemRepository(testPrisma)
const playSessionStateRepository = new IoRedisPlaySessionStateRepository(testRedis)

const app = createTestApp()
app.use(
  "/api/play-sessions",
  playSessionRouter({
    startSolo: new PlaySessionStartSoloController(
      crawledRepoRepository,
      languageRepository,
      playSessionStateRepository,
      problemRepository,
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
 * languages / crawled_repos / problems を seed
 * options.disabled で eligible 対象から外せる
 */
const seedRepoWithProblems = async (problemCount: number, options?: {
  disabled?: boolean
}) => {
  const language = await testPrisma.language.create({
    data: { name: "TypeScript", slug: "typescript" },
  })
  const repo = await testPrisma.crawledRepo.create({
    data: {
      candidatesCount: problemCount,
      commitSha: "abc123",
      crawledAt: new Date(),
      defaultBranch: "main",
      description: "Test repo",
      disabled: options?.disabled ?? false,
      fullName: "owner/repo",
      githubId: BigInt(123456),
      languageId: language.id,
      license: "MIT",
      name: "repo",
      owner: "owner",
      stars: 1500,
      storedCount: problemCount,
      topics: ["typescript", "framework"],
    },
  })
  await testPrisma.problem.createMany({
    data: Array.from({ length: problemCount }, (_, i) => ({
      astHash: `hash${i}`,
      charCount: 100,
      codeBlock: `function f${i}() { return ${i} }`,
      crawledRepoId: repo.id,
      functionName: `f${i}`,
      languageId: language.id,
      lineCount: 1,
      sourceFilePath: `src/f${i}.ts`,
      sourceLineEnd: 1,
      sourceLineStart: 1,
      sourceUrl: `https://github.com/owner/repo/blob/main/src/f${i}.ts#L1`,
    })),
  })
  return { language, repo }
}

describe("POST /api/play-sessions/solo", () => {
  describe("正常系", () => {
    it("eligible repo に 20 問以上ある場合、200 と 20 問のシーケンスを返し Redis にステートが保存される", async () => {
      const { language, repo } = await seedRepoWithProblems(30)
      const { token, user } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/solo")
        .set("Authorization", `Bearer ${token}`)
        .send({ language_id: language.id })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        problems: expect.any(Array),
        repo_info: {
          description: "Test repo",
          homepage: null,
          name: "repo",
          owner: "owner",
          stars: 1500,
          topics: ["typescript", "framework"],
        },
        session_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      })
      expect(res.body.problems).toHaveLength(20)
      expect(res.body.problems.map((p: { order_index: number }) => p.order_index)).toEqual(
        Array.from({ length: 20 }, (_, i) => i),
      )

      /**
       * Redis に書き込まれていることを確認
       */
      const state = await playSessionStateRepository.findById(res.body.session_id)
      expect(state).toMatchObject({
        crawledRepoId: repo.id,
        ghostSessionId: null,
        languageId: language.id,
        mode: "solo",
        userId: user.id,
      })
      expect(state!.problemIds).toHaveLength(20)
    })
  })

  describe("異常系", () => {
    it("メイン repo が 18 問しかない場合（pool 仕様上は通常発生しない異常系）、404 を返す", async () => {
      const { language } = await seedRepoWithProblems(18)
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/solo")
        .set("Authorization", `Bearer ${token}`)
        .send({ language_id: language.id })

      expect(res.status).toBe(404)
    })

    it("認証なしの場合、401 を返す", async () => {
      const { language } = await seedRepoWithProblems(30)

      const res = await request(app)
        .post("/api/play-sessions/solo")
        .send({ language_id: language.id })

      expect(res.status).toBe(401)
      expect(res.body.error).toBeDefined()
    })

    it("language_id が無い場合、400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/solo")
        .set("Authorization", `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("存在しない language_id の場合、400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/solo")
        .set("Authorization", `Bearer ${token}`)
        .send({ language_id: 99999 })

      expect(res.status).toBe(400)
    })

    it("eligible repo が無い（全 disabled）場合、404 を返す", async () => {
      const { language } = await seedRepoWithProblems(30, { disabled: true })
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/play-sessions/solo")
        .set("Authorization", `Bearer ${token}`)
        .send({ language_id: language.id })

      expect(res.status).toBe(404)
    })
  })
})
