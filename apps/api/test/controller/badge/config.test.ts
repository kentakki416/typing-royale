import request from "supertest"

import { BadgeConfigGetController } from "../../../src/controller/badge/config-get"
import { BadgeConfigUpdateController } from "../../../src/controller/badge/config-update"
import { PrismaBadgeConfigRepository } from "../../../src/repository/prisma"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const badgeConfigRepository = new PrismaBadgeConfigRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/user",
  userRouter({
    badgeConfigGet: new BadgeConfigGetController(badgeConfigRepository),
    badgeConfigUpdate: new BadgeConfigUpdateController(badgeConfigRepository),
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

describe("GET /api/user/badge-config", () => {
  describe("正常系", () => {
    it("未保存ユーザーで defaults を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .get("/api/user/badge-config")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        display_items: ["grade", "best_score"],
        theme: "dark",
        updated_at: expect.any(String),
      })
    })

    it("保存済みユーザーで DB の値を返す", async () => {
      const { token, user } = await createTestUser()
      await testPrisma.badgeConfig.create({
        data: {
          displayItems: ["grade", "rank", "streak_days"],
          theme: "light",
          userId: user.id,
        },
      })

      const res = await request(app)
        .get("/api/user/badge-config")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        display_items: ["grade", "rank", "streak_days"],
        theme: "light",
      })
    })
  })

  describe("異常系", () => {
    it("認証なしで 401", async () => {
      const res = await request(app).get("/api/user/badge-config")

      expect(res.status).toBe(401)
    })
  })
})

describe("PUT /api/user/badge-config", () => {
  describe("正常系", () => {
    it("upsert 新規作成", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .put("/api/user/badge-config")
        .set("Authorization", `Bearer ${token}`)
        .send({ display_items: ["grade", "rank"], theme: "light" })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        display_items: ["grade", "rank"],
        theme: "light",
      })

      const row = await testPrisma.badgeConfig.findUnique({ where: { userId: user.id } })
      expect(row).toMatchObject({
        displayItems: ["grade", "rank"],
        theme: "light",
        userId: user.id,
      })
    })

    it("upsert 上書き", async () => {
      const { token, user } = await createTestUser()
      await testPrisma.badgeConfig.create({
        data: { displayItems: ["grade"], theme: "dark", userId: user.id },
      })

      const res = await request(app)
        .put("/api/user/badge-config")
        .set("Authorization", `Bearer ${token}`)
        .send({ display_items: ["username", "typed_chars"], theme: "light" })

      expect(res.status).toBe(200)
      const row = await testPrisma.badgeConfig.findUniqueOrThrow({ where: { userId: user.id } })
      expect(row.displayItems).toEqual(["username", "typed_chars"])
      expect(row.theme).toBe("light")
    })
  })

  describe("異常系", () => {
    it("display_items が 0 要素で 400", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .put("/api/user/badge-config")
        .set("Authorization", `Bearer ${token}`)
        .send({ display_items: [], theme: "dark" })

      expect(res.status).toBe(400)
    })

    it("display_items が 6 要素で 400", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .put("/api/user/badge-config")
        .set("Authorization", `Bearer ${token}`)
        .send({
          display_items: ["grade", "best_score", "rank", "streak_days", "typed_chars", "username"],
          theme: "dark",
        })

      expect(res.status).toBe(400)
    })

    it("不正な display_items 要素で 400", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .put("/api/user/badge-config")
        .set("Authorization", `Bearer ${token}`)
        .send({ display_items: ["invalid_slug"], theme: "dark" })

      expect(res.status).toBe(400)
    })

    it("不正な theme で 400", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .put("/api/user/badge-config")
        .set("Authorization", `Bearer ${token}`)
        .send({ display_items: ["grade"], theme: "rainbow" })

      expect(res.status).toBe(400)
    })

    it("認証なしで 401", async () => {
      const res = await request(app)
        .put("/api/user/badge-config")
        .send({ display_items: ["grade"], theme: "dark" })

      expect(res.status).toBe(401)
    })
  })
})
