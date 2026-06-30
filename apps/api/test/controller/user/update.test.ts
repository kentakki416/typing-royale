import request from "supertest"

import { UserUpdateController } from "../../../src/controller/user/update"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)

const app = createTestApp()
app.use("/api/user", userRouter({ update: new UserUpdateController(userRepository) }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PATCH /api/user", () => {
  describe("正常系", () => {
    it("can_public_ranking を false に切り替える", async () => {
      const { token, user } = await createTestUser({ canPublicRanking: true })

      const res = await request(app)
        .patch("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ can_public_ranking: false })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ can_public_ranking: false })

      const updated = await testPrisma.user.findUnique({ where: { id: user.id } })
      expect(updated).toMatchObject({ canPublicRanking: false })
    })
  })

  describe("異常系", () => {
    it("空ボディの場合、400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .patch("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("認証ヘッダが無い場合、401 を返す", async () => {
      const res = await request(app)
        .patch("/api/user")
        .send({ can_public_ranking: false })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("favorite_repo_url が javascript: スキームの場合、400 を返す（stored XSS 防止）", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .patch("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ favorite_repo_url: "javascript:alert(document.cookie)" })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })

      const updated = await testPrisma.user.findUnique({ where: { id: user.id } })
      expect(updated).toMatchObject({ favoriteRepoUrl: null })
    })
  })
})
