import request from "supertest"

import { PlaySessionGuestStartSoloController } from "../../../src/controller/play-session/guest-start-solo"
import {
  PrismaCrawledRepoRepository,
  PrismaLanguageRepository,
  PrismaProblemRepository,
} from "../../../src/repository/prisma"
import { playSessionRouter } from "../../../src/routes/play-session-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
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

const app = createTestApp()
app.use(
  "/api/play-sessions",
  playSessionRouter({
    guestStartSolo: new PlaySessionGuestStartSoloController(
      crawledRepoRepository,
      languageRepository,
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
 */
const seedRepoWithProblems = async (problemCount: number) => {
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
      fullName: "owner/repo",
      githubId: BigInt(123456),
      languageId: language.id,
      license: "MIT",
      name: "repo",
      owner: "owner",
      stars: 1500,
      storedCount: problemCount,
      topics: ["typescript"],
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

describe("POST /api/play-sessions/guest/solo", () => {
  describe("正常系", () => {
    it("認証なしで 20 問のシーケンス + repo_info を返す。session_id は含まれず Redis にも書かれない", async () => {
      await seedRepoWithProblems(30)

      const res = await request(app)
        .post("/api/play-sessions/guest/solo")
        .send({ language_id: (await testPrisma.language.findFirstOrThrow()).id })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        problems: expect.any(Array),
        repo_info: {
          description: "Test repo",
          homepage: null,
          name: "repo",
          owner: "owner",
          stars: 1500,
          topics: ["typescript"],
        },
      })
      expect(res.body.problems).toHaveLength(20)
      expect(res.body.problems.map((p: { order_index: number }) => p.order_index)).toEqual(
        Array.from({ length: 20 }, (_, i) => i),
      )
      /** ステートレスなので session_id 等のセッション識別子は返さない */
      expect(res.body.session_id).toBeUndefined()

      /** Redis のキーが play_session: 配下に作られていないことを確認 */
      const keys = await testRedis.keys("play_session:*")
      expect(keys).toEqual([])
    })
  })

  describe("異常系", () => {
    it("language_id が無い場合、400 を返す", async () => {
      const res = await request(app)
        .post("/api/play-sessions/guest/solo")
        .send({})

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("存在しない language_id の場合、400 を返す", async () => {
      const res = await request(app)
        .post("/api/play-sessions/guest/solo")
        .send({ language_id: 99999 })

      expect(res.status).toBe(400)
    })

    it("eligible repo が無い場合、404 を返す", async () => {
      await testPrisma.language.create({
        data: { name: "TypeScript", slug: "typescript" },
      })

      const res = await request(app)
        .post("/api/play-sessions/guest/solo")
        .send({ language_id: (await testPrisma.language.findFirstOrThrow()).id })

      expect(res.status).toBe(404)
    })
  })
})
