import request from "supertest"

import { RankingMonthlyListController } from "../../../src/controller/ranking/monthly-list"
import {
  PrismaLanguageRepository,
  PrismaMonthlyRankingSnapshotRepository,
} from "../../../src/repository/prisma"
import { rankingRouter } from "../../../src/routes/ranking-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  testPrisma,
} from "../setup"

const languageRepository = new PrismaLanguageRepository(testPrisma)
const monthlyRankingSnapshotRepository = new PrismaMonthlyRankingSnapshotRepository(testPrisma)

const app = createTestApp()
app.use(
  "/api/rankings",
  rankingRouter({
    monthlyList: new RankingMonthlyListController(
      languageRepository,
      monthlyRankingSnapshotRepository,
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

/**
 * JST 暦月の "YYYY-MM" を取得するテスト用ヘルパ
 */
const currentYearMonthJst = (): string => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}`
}

/**
 * language + 任意人数分の user + monthly_ranking_snapshots を seed する。
 * 当月の yearMonth を使って書き込む (テストは「現在月」を見るため)。
 * v2 では rank カラムは廃止済みのため seed に rank は含めず、ORDER BY score DESC, ...
 * の順位はアプリ側 (Service) で振られる
 */
const seedMonthlySnapshots = async (
  entries: Array<{
    accuracy: number
    githubUsername: string
    playedAt: Date
    score: number
  }>,
) => {
  const yearMonth = currentYearMonthJst()
  const language = await testPrisma.language.create({
    data: { name: "TypeScript", slug: "typescript" },
  })

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const user = await testPrisma.user.create({
      data: {
        canPublicRanking: true,
        githubUsername: e.githubUsername,
        email: `u${i}@example.com`,
      },
    })
    await testPrisma.monthlyRankingSnapshot.create({
      data: {
        accuracy: e.accuracy,
        languageId: language.id,
        playedAt: e.playedAt,
        score: e.score,
        userId: user.id,
        yearMonth,
      },
    })
  }
  return { language, yearMonth }
}

describe("GET /api/rankings/monthly", () => {
  describe("正常系", () => {
    it("rank 順に entries を返し、year_month と限られたフィールドのレスポンスになる", async () => {
      const { yearMonth } = await seedMonthlySnapshots([
        { accuracy: 0.99, githubUsername: "alice", playedAt: new Date("2026-06-10T03:00:00Z"), score: 300 },
        { accuracy: 0.95, githubUsername: "bob", playedAt: new Date("2026-06-12T03:00:00Z"), score: 250 },
      ])

      const res = await request(app)
        .get("/api/rankings/monthly")
        .query({ language: "typescript", limit: 5 })

      expect(res.status).toBe(200)
      expect(res.body.year_month).toBe(yearMonth)
      expect(res.body.entries).toHaveLength(2)
      expect(res.body.entries[0]).toMatchObject({ rank: 1, score: 300, user: { github_username: "alice" } })
      expect(res.body.entries[1]).toMatchObject({ rank: 2, score: 250, user: { github_username: "bob" } })
    })

    it("当月のスナップショットが 0 件なら entries=[] で 200", async () => {
      await testPrisma.language.create({ data: { name: "TypeScript", slug: "typescript" } })

      const res = await request(app)
        .get("/api/rankings/monthly")
        .query({ language: "typescript" })

      expect(res.status).toBe(200)
      expect(res.body.entries).toEqual([])
      expect(res.body.year_month).toMatch(/^\d{4}-\d{2}$/)
    })

    it("言語マスタにある go は 200 を返す（言語 enum 撤廃の汎用化）", async () => {
      await testPrisma.language.create({ data: { name: "Go", slug: "go" } })

      const res = await request(app)
        .get("/api/rankings/monthly")
        .query({ language: "go" })

      expect(res.status).toBe(200)
      expect(res.body.entries).toEqual([])
      expect(res.body.year_month).toMatch(/^\d{4}-\d{2}$/)
    })

    it("limit を指定すると上位 N 件まで返す", async () => {
      await seedMonthlySnapshots([
        { accuracy: 0.99, githubUsername: "u1", playedAt: new Date("2026-06-10T03:00:00Z"), score: 300 },
        { accuracy: 0.98, githubUsername: "u2", playedAt: new Date("2026-06-10T03:00:00Z"), score: 280 },
        { accuracy: 0.97, githubUsername: "u3", playedAt: new Date("2026-06-10T03:00:00Z"), score: 270 },
      ])

      const res = await request(app)
        .get("/api/rankings/monthly")
        .query({ language: "typescript", limit: 2 })

      expect(res.status).toBe(200)
      expect(res.body.entries).toHaveLength(2)
      expect(res.body.entries.map((e: { rank: number }) => e.rank)).toEqual([1, 2])
    })
  })

  describe("異常系", () => {
    it("language が無いと 400", async () => {
      const res = await request(app).get("/api/rankings/monthly")
      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })

    it("言語マスタに無い language（python）は 400", async () => {
      const res = await request(app)
        .get("/api/rankings/monthly")
        .query({ language: "python" })

      expect(res.status).toBe(400)
    })

    it("limit が範囲外（11）は 400", async () => {
      const res = await request(app)
        .get("/api/rankings/monthly")
        .query({ language: "typescript", limit: 11 })

      expect(res.status).toBe(400)
    })
  })
})
