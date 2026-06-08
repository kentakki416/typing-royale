import request from "supertest"

import { ReplayFeaturedController } from "../../../src/controller/replay/featured"
import { PrismaReplayRepository } from "../../../src/repository/prisma"
import { replayRouter } from "../../../src/routes/replay-router"
import { attachErrorHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const replayRepository = new PrismaReplayRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/replays",
  replayRouter({
    featured: new ReplayFeaturedController(replayRepository),
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

const seed = async (overrides: { comment?: string | null; commentSubmittedAt?: Date | null; canPublicRanking?: boolean; languageSlug?: string } = {}) => {
  const { user } = await createTestUser({
    canPublicRanking: overrides.canPublicRanking ?? true,
    displayName: "Alice",
  })
  const langSlug = overrides.languageSlug ?? `lang-${user.id}-${Math.random().toString(36).slice(2, 10)}`
  const language = await testPrisma.language.create({
    data: { name: `Lang ${langSlug}`, slug: langSlug },
  })
  const repo = await testPrisma.crawledRepo.create({
    data: {
      candidatesCount: 0,
      commitSha: "abc",
      crawledAt: new Date(),
      defaultBranch: "main",
      description: null,
      fullName: `demo/${langSlug}`,
      githubId: BigInt(`${Date.now()}${Math.floor(Math.random() * 1_000_000)}`),
      homepage: null,
      languageId: language.id,
      license: "MIT",
      name: `demo-${langSlug}`,
      owner: "demo",
      stars: 10,
      storedCount: 0,
      topics: [],
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
      score: 1000,
      typedChars: 1050,
      userId: user.id,
    },
  })
  const entry = await testPrisma.hallOfFameEntry.create({
    data: {
      bestPlaySessionId: session.id,
      comment: "comment" in overrides ? overrides.comment : "great session",
      commentSubmittedAt: "commentSubmittedAt" in overrides
        ? overrides.commentSubmittedAt
        : new Date("2026-06-08T00:00:00Z"),
      languageId: language.id,
      userId: user.id,
    },
  })
  return { entry, language, session, user }
}

describe("GET /api/replays/featured", () => {
  describe("正常系", () => {
    it("comment 付きエントリを commentSubmittedAt DESC で返す", async () => {
      const a = await seed({ commentSubmittedAt: new Date("2026-06-01T00:00:00Z") })
      const b = await seed({ commentSubmittedAt: new Date("2026-06-05T00:00:00Z") })

      const res = await request(app).get("/api/replays/featured?limit=10")

      expect(res.status).toBe(200)
      expect(res.body.items).toHaveLength(2)
      expect(res.body.items[0].play_session_id).toBe(b.session.id)
      expect(res.body.items[1].play_session_id).toBe(a.session.id)
    })

    it("limit で件数を絞る", async () => {
      await seed({ commentSubmittedAt: new Date("2026-06-01T00:00:00Z") })
      await seed({ commentSubmittedAt: new Date("2026-06-05T00:00:00Z") })

      const res = await request(app).get("/api/replays/featured?limit=1")

      expect(res.status).toBe(200)
      expect(res.body.items).toHaveLength(1)
    })

    it("language で絞り込む", async () => {
      const ts = await seed({ commentSubmittedAt: new Date("2026-06-05T00:00:00Z"), languageSlug: "typescript-only" })
      await seed({ commentSubmittedAt: new Date("2026-06-05T00:00:00Z"), languageSlug: "javascript-only" })

      const res = await request(app).get("/api/replays/featured?limit=10&language=typescript-only")

      expect(res.status).toBe(200)
      expect(res.body.items).toHaveLength(1)
      expect(res.body.items[0].play_session_id).toBe(ts.session.id)
    })

    it("comment 無しは除外する", async () => {
      await seed({ comment: null, commentSubmittedAt: null })
      const res = await request(app).get("/api/replays/featured?limit=10")
      expect(res.status).toBe(200)
      expect(res.body.items).toEqual([])
    })

    it("canPublicRanking=false ユーザーは除外する", async () => {
      await seed({ canPublicRanking: false })
      const res = await request(app).get("/api/replays/featured?limit=10")
      expect(res.status).toBe(200)
      expect(res.body.items).toEqual([])
    })

    it("該当 0 件でも 200 で空配列", async () => {
      const res = await request(app).get("/api/replays/featured?limit=10")
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ items: [] })
    })
  })

  describe("異常系", () => {
    it("limit が 0 以下なら 400", async () => {
      const res = await request(app).get("/api/replays/featured?limit=0")
      expect(res.status).toBe(400)
    })

    it("limit が 21 以上なら 400", async () => {
      const res = await request(app).get("/api/replays/featured?limit=21")
      expect(res.status).toBe(400)
    })
  })
})
