import request from "supertest"

import { RewardsListMeController } from "../../../src/controller/rewards/me"
import { PrismaRewardRepository } from "../../../src/repository/prisma"
import { rewardsRouter } from "../../../src/routes/rewards-router"
import { attachErrorHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const rewardRepository = new PrismaRewardRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/rewards",
  rewardsRouter({
    me: new RewardsListMeController(rewardRepository),
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

describe("GET /api/rewards/me", () => {
  describe("正常系", () => {
    it("0 件で rewards=[] を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .get("/api/rewards/me")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ rewards: [] })
    })

    it("複数件を grantedAt DESC で返す", async () => {
      const { token, user } = await createTestUser()
      await testPrisma.reward.create({
        data: {
          assetUrl: "/cache/rewards/1-1.png",
          grantedAt: new Date("2026-06-01T00:00:00Z"),
          payload: { grade_slug: "junior" },
          type: "grade_up",
          userId: user.id,
        },
      })
      await testPrisma.reward.create({
        data: {
          assetUrl: "/cache/rewards/1-2.png",
          grantedAt: new Date("2026-06-05T00:00:00Z"),
          payload: { grade_slug: "senior" },
          type: "grade_up",
          userId: user.id,
        },
      })

      const res = await request(app)
        .get("/api/rewards/me")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.rewards).toHaveLength(2)
      /** grantedAt DESC: senior (06-05) が先、junior (06-01) が後 */
      expect(res.body.rewards[0].payload).toEqual({ grade_slug: "senior" })
      expect(res.body.rewards[1].payload).toEqual({ grade_slug: "junior" })
    })

    it("他人の reward は返さない", async () => {
      const { token, user } = await createTestUser()
      const other = await testPrisma.user.create({
        data: { canPublicRanking: true, displayName: "other", email: "o@example.com" },
      })
      await testPrisma.reward.create({
        data: {
          assetUrl: "/cache/rewards/other.png",
          grantedAt: new Date(),
          payload: { grade_slug: "fellow" },
          type: "grade_up",
          userId: other.id,
        },
      })
      await testPrisma.reward.create({
        data: {
          assetUrl: "/cache/rewards/mine.png",
          grantedAt: new Date(),
          payload: { grade_slug: "junior" },
          type: "grade_up",
          userId: user.id,
        },
      })

      const res = await request(app)
        .get("/api/rewards/me")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.rewards).toHaveLength(1)
      expect(res.body.rewards[0].payload).toEqual({ grade_slug: "junior" })
    })
  })

  describe("異常系", () => {
    it("認証なしで 401", async () => {
      const res = await request(app).get("/api/rewards/me")

      expect(res.status).toBe(401)
    })
  })
})
