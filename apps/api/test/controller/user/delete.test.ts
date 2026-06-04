import request from "supertest"

import { UserDeleteController } from "../../../src/controller/user/delete"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { IoRedisRefreshTokenRepository } from "../../../src/repository/redis"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testRedis,
} from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)

const app = createTestApp()
app.use(
  "/api/user",
  userRouter({ delete: new UserDeleteController(userRepository, refreshTokenRepository) }),
)
attachErrorHandler(app)

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

describe("DELETE /api/user", () => {
  describe("正常系", () => {
    it("自分のアカウントを削除し、Redis 上の Refresh Token も失効する", async () => {
      const { token, user } = await createTestUser()
      /** Refresh Token を 1 つ Redis に保存しておく */
      await refreshTokenRepository.save("test-jti", user.id, 3600)
      expect(await refreshTokenRepository.findUserId("test-jti")).toBe(user.id)

      const res = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: "OK" })

      /** User が DB から消えている */
      const remaining = await testPrisma.user.findUnique({ where: { id: user.id } })
      expect(remaining).toBeNull()

      /** Refresh Token が Redis から消えている */
      expect(await refreshTokenRepository.findUserId("test-jti")).toBeNull()
    })

    it("AuthAccount が FK Cascade で連動削除される", async () => {
      const { token, user } = await createTestUser()
      await testPrisma.authAccount.create({
        data: { provider: "github", providerAccountId: "cascade-1", userId: user.id },
      })

      const res = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)

      const remaining = await testPrisma.authAccount.findFirst({
        where: { provider: "github", providerAccountId: "cascade-1" },
      })
      expect(remaining).toBeNull()
    })
  })

  describe("異常系", () => {
    it("認証ヘッダが無い場合、401 を返す", async () => {
      const res = await request(app).delete("/api/user")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
