import request from "supertest"

import { HallOfFameCommentUpdateController } from "../../../src/controller/hall-of-fame/comment-update"
import {
  PrismaHallOfFameEntryRepository,
  PrismaLanguageRepository,
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

const app = createTestApp()
app.use(
  "/api/hall-of-fame",
  hallOfFameRouter({
    commentUpdate: new HallOfFameCommentUpdateController(
      hallOfFameEntryRepository,
      languageRepository,
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

const seedEntry = async (userId: number) => {
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
  const session = await testPrisma.playSession.create({
    data: {
      accuracy: 0.95,
      crawledRepoId: repo.id,
      languageId: language.id,
      mistypeStats: {},
      mode: "solo",
      playedAt: new Date(),
      problemsCompleted: 1,
      problemsPlayed: 1,
      score: 500,
      typedChars: 500,
      userId,
    },
  })
  return testPrisma.hallOfFameEntry.create({
    data: {
      bestPlaySessionId: session.id,
      comment: "old",
      commentSubmittedAt: new Date("2026-06-01T00:00:00Z"),
      languageId: language.id,
      userId,
    },
  })
}

describe("PATCH /api/hall-of-fame/comments/:entryId", () => {
  describe("正常系", () => {
    it("自分の entry を編集できる", async () => {
      const { token, user } = await createTestUser()
      const entry = await seedEntry(user.id)

      const res = await request(app)
        .patch(`/api/hall-of-fame/comments/${entry.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "編集後" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        comment: "編集後",
        comment_submitted_at: expect.any(String),
        entry_id: entry.id,
        language: "typescript",
      })

      const row = await testPrisma.hallOfFameEntry.findUniqueOrThrow({ where: { id: entry.id } })
      expect(row.comment).toBe("編集後")
    })
  })

  describe("異常系", () => {
    it("他人の entry を編集しようとすると 403", async () => {
      const otherUser = await testPrisma.user.create({
        data: { canPublicRanking: true, displayName: "other", email: "other@example.com" },
      })
      const entry = await seedEntry(otherUser.id)
      const { token } = await createTestUser()

      const res = await request(app)
        .patch(`/api/hall-of-fame/comments/${entry.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "乗っ取り" })

      expect(res.status).toBe(403)
    })

    it("存在しない entryId で 404", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .patch("/api/hall-of-fame/comments/99999")
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "OK" })

      expect(res.status).toBe(404)
    })

    it("認証なしで 401", async () => {
      const { user } = await createTestUser()
      const entry = await seedEntry(user.id)

      const res = await request(app)
        .patch(`/api/hall-of-fame/comments/${entry.id}`)
        .send({ comment: "OK" })

      expect(res.status).toBe(401)
    })

    it("NG ワード含むと 400", async () => {
      const { token, user } = await createTestUser()
      const entry = await seedEntry(user.id)

      const res = await request(app)
        .patch(`/api/hall-of-fame/comments/${entry.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "fuck" })

      expect(res.status).toBe(400)
    })

    it("entryId が数値でないと 400", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .patch("/api/hall-of-fame/comments/abc")
        .set("Authorization", `Bearer ${token}`)
        .send({ comment: "OK" })

      expect(res.status).toBe(400)
    })
  })
})
