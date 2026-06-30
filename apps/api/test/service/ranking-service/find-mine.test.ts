import {
  LanguageRef,
  LanguageRepository,
  MyLanguageBest,
  PlaySessionRepository,
  UserLanguageBestRepository,
  UserLanguageBestWithUser,
  UserLifetimeStatsRepository,
  UserLifetimeStatsSummary,
} from "../../../src/repository/prisma"
import { findMine } from "../../../src/service/ranking-service"

const mockFindBySlug = vi.fn<(_0: string) => Promise<LanguageRef | null>>()
const mockFindMine = vi.fn<(_0: number, _1: number) => Promise<MyLanguageBest | null>>()
const mockCountHigherRanked = vi.fn<(_0: number, _1: MyLanguageBest) => Promise<number>>()
const mockCountRankableByLanguage = vi.fn<(_0: number) => Promise<number>>()
const mockFindByUserId = vi.fn<(_0: number) => Promise<UserLifetimeStatsSummary | null>>()
const mockCountByUserAndLanguage = vi.fn<(_0: number, _1: number) => Promise<number>>()

const mockLanguageRepository: LanguageRepository = {
  existsById: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn(),
  findBySlug: mockFindBySlug,
}

const mockPlaySessionRepository: PlaySessionRepository = {
  countByUserAndLanguage: mockCountByUserAndLanguage,
  create: vi.fn(),
  findGhostSourceById: vi.fn(),
  getUserSummaryStats: vi.fn(),
}

const mockUserLanguageBestRepository: UserLanguageBestRepository = {
  countHigherRanked: mockCountHigherRanked,
  countRankableByLanguage: mockCountRankableByLanguage,
  findAllByUserId: vi.fn(),
  findMine: mockFindMine,
  findTenthScore: vi.fn(),
  findTopByLanguage: vi.fn<(_0: number, _1: number) => Promise<UserLanguageBestWithUser[]>>(),
  upsertIfBest: vi.fn(),
}

const mockUserLifetimeStatsRepository: UserLifetimeStatsRepository = {
  findByUserId: mockFindByUserId,
  upsertOnFinish: vi.fn(),
}

const buildRepoCollection = () => ({
  languageRepository: mockLanguageRepository,
  playSessionRepository: mockPlaySessionRepository,
  userLanguageBestRepository: mockUserLanguageBestRepository,
  userLifetimeStatsRepository: mockUserLifetimeStatsRepository,
})

describe("ranking.findMine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ベストありなら rank と grade / nextGrade を返す", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindMine.mockResolvedValue({
        accuracy: 0.97,
        bestPlaySessionId: 5,
        playedAt: new Date("2026-06-03T05:43:21.000Z"),
        score: 732,
        typedChars: 752,
      })
      mockFindByUserId.mockResolvedValue({
        bestScore: 732,
        currentGrade: "staff",
        currentGradeReachedAt: new Date("2026-06-01T00:00:00.000Z"),
        lifetimeMistypeStats: {},
        streakDays: 3,
        totalSessions: 12,
        totalTypedChars: 1234n,
      })
      mockCountHigherRanked.mockResolvedValue(86)
      mockCountRankableByLanguage.mockResolvedValue(53871)
      mockCountByUserAndLanguage.mockResolvedValue(24)

      const result = await findMine(
        { languageSlug: "typescript", userId: 10 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.rank).toBe(87)
        expect(result.value.bestScore).toBe(732)
        expect(result.value.grade.slug).toBe("staff")
        expect(result.value.nextGrade).not.toBeNull()
        expect(result.value.nextGrade?.slug).toBe("principal")
        /** Staff threshold 600 + bestScore 732 → next Principal 800 までは 68pt */
        expect(result.value.nextGrade?.scoreNeeded).toBe(68)
        expect(result.value.totalRankedPlayers).toBe(53871)
        expect(result.value.playCount).toBe(24)
      }
    })

    it("ベスト未保存なら rank=null / best_*=null / Intern を返す", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindMine.mockResolvedValue(null)
      mockFindByUserId.mockResolvedValue(null)
      mockCountRankableByLanguage.mockResolvedValue(0)
      mockCountByUserAndLanguage.mockResolvedValue(0)

      const result = await findMine(
        { languageSlug: "typescript", userId: 10 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.rank).toBeNull()
        expect(result.value.bestScore).toBeNull()
        expect(result.value.bestAccuracy).toBeNull()
        expect(result.value.bestPlaySessionId).toBeNull()
        expect(result.value.bestPlayedAt).toBeNull()
        expect(result.value.grade.slug).toBe("intern")
        expect(result.value.nextGrade?.slug).toBe("junior")
        expect(result.value.nextGrade?.scoreNeeded).toBe(100)
        expect(result.value.playCount).toBe(0)
      }
      expect(mockCountHigherRanked).not.toHaveBeenCalled()
    })

    it("Fellow グレード（bestScore >= 1200）なら nextGrade は null", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindMine.mockResolvedValue(null)
      mockFindByUserId.mockResolvedValue({
        bestScore: 1500,
        currentGrade: "fellow",
        currentGradeReachedAt: new Date("2026-06-01T00:00:00.000Z"),
        lifetimeMistypeStats: {},
        streakDays: 3,
        totalSessions: 12,
        totalTypedChars: 1234n,
      })
      mockCountRankableByLanguage.mockResolvedValue(10)

      const result = await findMine(
        { languageSlug: "typescript", userId: 10 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.grade.slug).toBe("fellow")
        expect(result.value.nextGrade).toBeNull()
      }
    })
  })

  describe("異常系", () => {
    it("存在しない言語 slug の場合、ok: false / 404 / NOT_FOUND を返す", async () => {
      mockFindBySlug.mockResolvedValue(null)

      const result = await findMine(
        { languageSlug: "python", userId: 10 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(mockFindMine).not.toHaveBeenCalled()
    })
  })
})
