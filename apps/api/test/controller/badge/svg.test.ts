import request from "supertest"

import { BadgeSvgController } from "../../../src/controller/badge/svg"
import {
  PrismaBadgeConfigRepository,
  PrismaLanguageRepository,
  PrismaUserLanguageBestRepository,
  PrismaUserLifetimeStatsRepository,
  PrismaUserRepository,
} from "../../../src/repository/prisma"
import { badgeRouter } from "../../../src/routes/badge-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const userLifetimeStatsRepository = new PrismaUserLifetimeStatsRepository(testPrisma)
const userLanguageBestRepository = new PrismaUserLanguageBestRepository(testPrisma)
const languageRepository = new PrismaLanguageRepository(testPrisma)
const badgeConfigRepository = new PrismaBadgeConfigRepository(testPrisma)

const app = createTestApp()
app.use(
  "/badge",
  badgeRouter({
    svg: new BadgeSvgController(
      badgeConfigRepository,
      languageRepository,
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

describe("GET /badge/:username.svg", () => {
  describe("正常系", () => {
    it("公開ユーザーの SVG を返し Cache-Control が立つ", async () => {
      await testPrisma.user.create({
        data: { canPublicRanking: true, githubUsername: "alice", email: "a@example.com" },
      })

      const res = await request(app).get("/badge/alice.svg")

      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toContain("image/svg+xml")
      expect(res.headers["cache-control"]).toContain("max-age=300")
      expect(res.text || res.body.toString()).toContain("<svg")
      expect(res.text || res.body.toString()).toContain("Typing Royale")
      /** lifetime_stats / badge_configs 未保存なら defaults (Intern + 0 pts) */
      expect(res.text || res.body.toString()).toContain("Intern")
    })

    it("存在しない username で private SVG を 200 で返す", async () => {
      const res = await request(app).get("/badge/nobody.svg")

      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toContain("image/svg+xml")
      expect(res.text || res.body.toString()).toContain("Private or not found")
    })

    it("canPublicRanking=false のユーザーで private SVG を返す", async () => {
      await testPrisma.user.create({
        data: { canPublicRanking: false, githubUsername: "hidden", email: "h@example.com" },
      })

      const res = await request(app).get("/badge/hidden.svg")

      expect(res.status).toBe(200)
      expect(res.text || res.body.toString()).toContain("Private or not found")
    })
  })

  describe("異常系", () => {
    it("不正な username で BadRequest SVG を 200 で返す", async () => {
      const res = await request(app).get("/badge/invalid%20user.svg")

      expect(res.status).toBe(200)
      expect(res.text || res.body.toString()).toContain("Invalid username")
    })
  })
})
