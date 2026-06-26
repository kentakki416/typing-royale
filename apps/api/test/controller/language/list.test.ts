import request from "supertest"

import { LanguageListController } from "../../../src/controller/language/list"
import { PrismaLanguageRepository } from "../../../src/repository/prisma"
import { languageRouter } from "../../../src/routes/language-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, testPrisma } from "../setup"

const languageRepository = new PrismaLanguageRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/languages",
  languageRouter({
    list: new LanguageListController(languageRepository),
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

describe("GET /api/languages", () => {
  describe("正常系", () => {
    it("言語マスタを id 昇順で全件返す（認証不要）", async () => {
      await testPrisma.language.createMany({
        data: [
          { name: "JavaScript", slug: "javascript" },
          { name: "TypeScript", slug: "typescript" },
        ],
      })

      const res = await request(app).get("/api/languages")

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        languages: [
          { id: expect.any(Number), name: expect.any(String), slug: expect.any(String) },
          { id: expect.any(Number), name: expect.any(String), slug: expect.any(String) },
        ],
      })
      // id 昇順であること
      expect(res.body.languages[0].id).toBeLessThan(res.body.languages[1].id)
    })

    it("言語マスタが空のとき空配列を返す（500 にしない）", async () => {
      const res = await request(app).get("/api/languages")

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ languages: [] })
    })
  })
})
