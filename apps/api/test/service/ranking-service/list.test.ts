import {
  LanguageRef,
  LanguageRepository,
  MyLanguageBest,
  UserLanguageBestRepository,
  UserLanguageBestWithUser,
} from "../../../src/repository/prisma"
import { list } from "../../../src/service/ranking-service"

const mockFindBySlug = vi.fn<(_0: string) => Promise<LanguageRef | null>>()
const mockFindTopByLanguage = vi.fn<(_0: number, _1: number) => Promise<UserLanguageBestWithUser[]>>()
const mockCountRankableByLanguage = vi.fn<(_0: number) => Promise<number>>()

const mockLanguageRepository: LanguageRepository = {
  existsById: vi.fn(),
  findBySlug: mockFindBySlug,
}

const mockUserLanguageBestRepository: UserLanguageBestRepository = {
  countHigherRanked: vi.fn<(_0: number, _1: MyLanguageBest) => Promise<number>>(),
  countRankableByLanguage: mockCountRankableByLanguage,
  findMine: vi.fn<(_0: number, _1: number) => Promise<MyLanguageBest | null>>(),
  findTopByLanguage: mockFindTopByLanguage,
}

const buildRepoCollection = () => ({
  languageRepository: mockLanguageRepository,
  userLanguageBestRepository: mockUserLanguageBestRepository,
})

const buildTopEntry = (overrides?: Partial<UserLanguageBestWithUser>): UserLanguageBestWithUser => ({
  accuracy: 0.95,
  bestPlaySessionId: 100,
  playedAt: new Date("2026-06-01T00:00:00.000Z"),
  score: 500,
  typedChars: 600,
  user: {
    avatarUrl: null,
    currentGrade: "senior",
    displayName: "tester",
    id: 1,
  },
  ...overrides,
})

describe("ranking.list", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ベストありの言語で TOP N と rank を 1..N で採番して返す", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindTopByLanguage.mockResolvedValue([
        buildTopEntry({ score: 800, user: { avatarUrl: null, currentGrade: "principal", displayName: "u1", id: 1 } }),
        buildTopEntry({ score: 600, user: { avatarUrl: null, currentGrade: "staff", displayName: "u2", id: 2 } }),
        buildTopEntry({ score: 400, user: { avatarUrl: null, currentGrade: "senior", displayName: "u3", id: 3 } }),
      ])
      mockCountRankableByLanguage.mockResolvedValue(3)

      const result = await list(
        { languageSlug: "typescript", limit: 10 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries.map((e) => e.rank)).toEqual([1, 2, 3])
        expect(result.value.entries.map((e) => e.score)).toEqual([800, 600, 400])
        expect(result.value.language).toBe("typescript")
        expect(result.value.totalRankedPlayers).toBe(3)
      }
    })

    it("ベストが 0 件でも空配列 + totalRankedPlayers=0 で 200 を返す", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindTopByLanguage.mockResolvedValue([])
      mockCountRankableByLanguage.mockResolvedValue(0)

      const result = await list(
        { languageSlug: "typescript", limit: 10 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries).toEqual([])
        expect(result.value.totalRankedPlayers).toBe(0)
      }
    })
  })

  describe("異常系", () => {
    it("存在しない言語 slug の場合、ok: false / 404 / NOT_FOUND を返す", async () => {
      mockFindBySlug.mockResolvedValue(null)

      const result = await list(
        { languageSlug: "python", limit: 10 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(mockFindTopByLanguage).not.toHaveBeenCalled()
    })
  })
})
