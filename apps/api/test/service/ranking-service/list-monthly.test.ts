import {
  LanguageRef,
  LanguageRepository,
  MonthlyRankingSnapshotRepository,
  MonthlyRankingTopEntry,
} from "../../../src/repository/prisma"
import { listMonthly } from "../../../src/service/ranking-service"

const mockFindBySlug = vi.fn<(_0: string) => Promise<LanguageRef | null>>()
const mockFindTopByLanguage = vi.fn<
  (_0: string, _1: number, _2: number) => Promise<MonthlyRankingTopEntry[]>
>()

const mockLanguageRepository: LanguageRepository = {
  existsById: vi.fn(),
  findBySlug: mockFindBySlug,
}

const mockMonthlyRankingSnapshotRepository: MonthlyRankingSnapshotRepository = {
  findTopByLanguage: mockFindTopByLanguage,
}

const buildRepoCollection = () => ({
  languageRepository: mockLanguageRepository,
  monthlyRankingSnapshotRepository: mockMonthlyRankingSnapshotRepository,
})

const buildEntry = (overrides?: Partial<MonthlyRankingTopEntry>): MonthlyRankingTopEntry => ({
  accuracy: 0.95,
  playedAt: new Date("2026-06-10T03:00:00.000Z"),
  rank: 1,
  score: 250,
  user: {
    avatarUrl: null,
    currentGrade: "senior",
    displayName: "alice",
    id: 1,
  },
  ...overrides,
})

describe("listMonthly", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("対象言語のスナップショットが返り、yearMonth は YYYY-MM 形式", async () => {
      mockFindBySlug.mockResolvedValueOnce({ id: 1, name: "TypeScript", slug: "typescript" })
      mockFindTopByLanguage.mockResolvedValueOnce([
        buildEntry({ rank: 1, score: 300 }),
        buildEntry({ rank: 2, score: 250, user: { ...buildEntry().user, id: 2, displayName: "bob" } }),
      ])

      const result = await listMonthly(
        { languageSlug: "typescript", limit: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries).toHaveLength(2)
        expect(result.value.yearMonth).toMatch(/^\d{4}-\d{2}$/)
      }
      expect(mockFindBySlug).toHaveBeenCalledWith("typescript")
      expect(mockFindTopByLanguage).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}$/),
        1,
        5,
      )
    })

    it("当月のスナップショットが 0 件でも空 entries を返す", async () => {
      mockFindBySlug.mockResolvedValueOnce({ id: 1, name: "TypeScript", slug: "typescript" })
      mockFindTopByLanguage.mockResolvedValueOnce([])

      const result = await listMonthly(
        { languageSlug: "typescript", limit: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries).toHaveLength(0)
      }
    })
  })

  describe("異常系", () => {
    it("language slug が DB に存在しない場合 BAD_REQUEST", async () => {
      mockFindBySlug.mockResolvedValueOnce(null)

      const result = await listMonthly(
        { languageSlug: "typescript", limit: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.statusCode).toBe(400)
      }
      expect(mockFindTopByLanguage).not.toHaveBeenCalled()
    })

    it("DB 障害時にエラーをスローする", async () => {
      mockFindBySlug.mockResolvedValueOnce({ id: 1, name: "TypeScript", slug: "typescript" })
      mockFindTopByLanguage.mockRejectedValueOnce(new Error("db down"))

      await expect(
        listMonthly({ languageSlug: "typescript", limit: 5 }, buildRepoCollection()),
      ).rejects.toThrow()
    })
  })
})
