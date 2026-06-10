import request from "supertest"

import { HallOfFameCommentCreateController } from "../../../src/controller/hall-of-fame/comment-create"
import {
  PrismaHallOfFameEntryRepository,
  PrismaLanguageRepository,
  PrismaUserLanguageBestRepository,
} from "../../../src/repository/prisma"
import { hallOfFameRouter } from "../../../src/routes/hall-of-fame-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
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
    commentCreate: new HallOfFameCommentCreateController(
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

const seedLanguageAndRepo = async () => {
  const language = await testPrisma.language.create({
    data: { name: "TypeScript", slug: "typescript" },
  })
  const repo = await testPrisma.crawledRepo.create({
    data: {
      candidatesCount: 30,
      commitSha: "abc",
      crawledAt: new Date(),
      defaultBranch: "main",
      description: null,
      fullName: "owner/repo",
      githubId: BigInt(1),
      languageId: language.id,
      license: "MIT",
      name: "repo",
      owner: "owner",
      stars: 100,
      storedCount: 30,
      topics: ["typescript"],
    },
  })
  return { language, repo }
}

const seedUserBest = async (params: {
  languageId: number
  repoId: number
  userId: number
}) => {
  const session = await testPrisma.playSession.create({
    data: {
      accuracy: 0.95,
      crawledRepoId: params.repoId,
      languageId: params.languageId,
      mistypeStats: {},
      mode: "solo",
      playedAt: new Date(),
      problemsCompleted: 1,
      problemsPlayed: 1,
      score: 500,
      typedChars: 500,
      userId: params.userId,
    },
  })
  await testPrisma.userLanguageBest.create({
    data: {
      accuracy: 0.95,
      bestPlaySessionId: session.id,
      languageId: params.languageId,
      playedAt: new Date(),
      score: 500,
      typedChars: 500,
      userId: params.userId,
    },
  })
  return session
}

describe("POST /api/hall-of-fame/comments", () => {
  describe("正常系", () => {
    it("初回送信で hall_of_fame_entries に行が作成される", async () => {
      const { language, repo } = await seedLanguageAndRepo()
      const { token, user } = await createTestUser()
      await seedUserBest({ languageId: language.id, repoId: repo.id, userId: user.id })

      const res = await request(app)
        .post("/api/hall-of-fame/comments")
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "OSS 大好き", language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        comment: "OSS 大好き",
        comment_submitted_at: expect.any(String),
        entry_id: expect.any(Number),
        language: "typescript",
      })

      const row = await testPrisma.hallOfFameEntry.findUniqueOrThrow({
        where: { userId_languageId: { languageId: language.id, userId: user.id } },
      })
      expect(row.comment).toBe("OSS 大好き")
      expect(row.commentSubmittedAt).not.toBeNull()
    })

    it("2 回目送信で upsert される（commentSubmittedAt は維持）", async () => {
      const { language, repo } = await seedLanguageAndRepo()
      const { token, user } = await createTestUser()
      const session = await seedUserBest({ languageId: language.id, repoId: repo.id, userId: user.id })

      const firstAt = new Date("2026-06-01T00:00:00Z")
      await testPrisma.hallOfFameEntry.create({
        data: {
          bestPlaySessionId: session.id,
          comment: "初回",
          commentSubmittedAt: firstAt,
          languageId: language.id,
          userId: user.id,
        },
      })

      const res = await request(app)
        .post("/api/hall-of-fame/comments")
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "編集後", language: "typescript" })

      expect(res.status).toBe(200)
      const row = await testPrisma.hallOfFameEntry.findUniqueOrThrow({
        where: { userId_languageId: { languageId: language.id, userId: user.id } },
      })
      expect(row.comment).toBe("編集後")
      /** commentSubmittedAt は最初の送信時刻を維持 */
      expect(row.commentSubmittedAt?.toISOString()).toBe(firstAt.toISOString())
    })
  })

  describe("異常系", () => {
    it("認証なしで 401", async () => {
      await seedLanguageAndRepo()

      const res = await request(app)
        .post("/api/hall-of-fame/comments")
        .send({ comment: "OK", language: "typescript" })

      expect(res.status).toBe(401)
    })

    it("該当言語のベストが無いユーザーで 409", async () => {
      await seedLanguageAndRepo()
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/hall-of-fame/comments")
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "OK", language: "typescript" })

      expect(res.status).toBe(409)
    })

    it("NG ワード含むコメントで 400", async () => {
      const { language, repo } = await seedLanguageAndRepo()
      const { token, user } = await createTestUser()
      await seedUserBest({ languageId: language.id, repoId: repo.id, userId: user.id })

      const res = await request(app)
        .post("/api/hall-of-fame/comments")
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "死ね", language: "typescript" })

      expect(res.status).toBe(400)
    })

    it("不正な language で 404", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/hall-of-fame/comments")
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "OK", language: "python" })

      expect(res.status).toBe(404)
    })

    it("comment が空で 400", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/hall-of-fame/comments")
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "", language: "typescript" })

      expect(res.status).toBe(400)
    })
  })
})
