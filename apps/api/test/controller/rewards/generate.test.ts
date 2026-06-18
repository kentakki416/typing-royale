import request from "supertest"

import { RewardsGenerateController } from "../../../src/controller/rewards/generate"
import { LocalCardStorage } from "../../../src/lib/card-storage"
import { PrismaRewardRepository, PrismaUserRepository } from "../../../src/repository/prisma"
import { rewardsRouter } from "../../../src/routes/rewards-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const rewardRepository = new PrismaRewardRepository(testPrisma)
const userRepository = new PrismaUserRepository(testPrisma)
const cardStorage = new LocalCardStorage("/tmp/typing-royale-rewards-test-generate", "/cache/rewards")

const app = createTestApp()
app.use(
  "/api/rewards",
  rewardsRouter({
    generate: new RewardsGenerateController(rewardRepository, userRepository, cardStorage),
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

describe("POST /api/rewards/generate", () => {
  describe("正常系", () => {
    it("hall_of_fame_in で 200 を返し DB に行が作られる", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .post("/api/rewards/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({ language: "typescript", rank: 3, type: "hall_of_fame_in" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        asset_svg_url: expect.stringContaining("HALL OF FAME"),
        asset_url: expect.any(String),
        granted_at: expect.any(String),
        payload: { language: "typescript", rank: 3 },
        reward_id: expect.any(Number),
        type: "hall_of_fame_in",
      })

      const rows = await testPrisma.reward.findMany({ where: { userId: user.id } })
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        assetSvgUrl: expect.stringContaining("HALL OF FAME"),
        assetUrl: expect.any(String),
        type: "hall_of_fame_in",
      })
    })

    it("monthly_top_ten で 200 を返し year_month を含む payload で保存される", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .post("/api/rewards/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({
          language: "typescript",
          rank: 7,
          type: "monthly_top_ten",
          year_month: "2026-06",
        })

      expect(res.status).toBe(200)
      expect(res.body.payload).toEqual({
        language: "typescript",
        rank: 7,
        year_month: "2026-06",
      })

      const rows = await testPrisma.reward.findMany({ where: { userId: user.id } })
      expect(rows).toHaveLength(1)
    })

    it("二重リクエストでも冪等で 1 行のみ作られる (同じ rank の場合)", async () => {
      const { token, user } = await createTestUser()

      await request(app)
        .post("/api/rewards/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({ language: "typescript", rank: 3, type: "hall_of_fame_in" })
      const res2 = await request(app)
        .post("/api/rewards/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({ language: "typescript", rank: 3, type: "hall_of_fame_in" })

      expect(res2.status).toBe(200)

      const rows = await testPrisma.reward.findMany({ where: { userId: user.id } })
      expect(rows).toHaveLength(1)
    })

    it("rank が変わった場合は同じ行を上書き (= 1 行のみ、rank=新しい値)", async () => {
      const { token, user } = await createTestUser()

      await request(app)
        .post("/api/rewards/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({ language: "typescript", rank: 5, type: "hall_of_fame_in" })
      await request(app)
        .post("/api/rewards/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({ language: "typescript", rank: 3, type: "hall_of_fame_in" })

      const rows = await testPrisma.reward.findMany({ where: { userId: user.id } })
      expect(rows).toHaveLength(1)
      expect((rows[0].payload as { rank: number }).rank).toBe(3)
    })
  })

  describe("異常系", () => {
    it("認証なしで 401", async () => {
      const res = await request(app)
        .post("/api/rewards/generate")
        .send({ language: "typescript", rank: 3, type: "hall_of_fame_in" })
      expect(res.status).toBe(401)
    })

    it("rank=0 で 400", async () => {
      const { token } = await createTestUser()
      const res = await request(app)
        .post("/api/rewards/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({ language: "typescript", rank: 0, type: "hall_of_fame_in" })
      expect(res.status).toBe(400)
    })

    it("monthly_top_ten で year_month 形式不正なら 400", async () => {
      const { token } = await createTestUser()
      const res = await request(app)
        .post("/api/rewards/generate")
        .set("Authorization", `Bearer ${token}`)
        .send({
          language: "typescript",
          rank: 3,
          type: "monthly_top_ten",
          year_month: "2026/06",
        })
      expect(res.status).toBe(400)
    })
  })
})
