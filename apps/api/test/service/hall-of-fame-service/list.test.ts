import {
  HallOfFameEntryRepository,
  HallOfFameEntryRow,
  LanguageRef,
  LanguageRepository,
  MyLanguageBest,
  UserLanguageBestRepository,
  UserLanguageBestWithUser,
} from "../../../src/repository/prisma"
import { list } from "../../../src/service/hall-of-fame-service"

const mockFindBySlug = vi.fn<(_0: string) => Promise<LanguageRef | null>>()
const mockFindTop = vi.fn<(_0: number, _1: number) => Promise<UserLanguageBestWithUser[]>>()
const mockFindManyByUserIds = vi.fn<(_0: number[], _1: number) => Promise<HallOfFameEntryRow[]>>()

const mockLanguageRepository: LanguageRepository = {
  existsById: vi.fn(),
  findById: vi.fn(),
  findBySlug: mockFindBySlug,
}

const mockUserLanguageBestRepository: UserLanguageBestRepository = {
  countHigherRanked: vi.fn<(_0: number, _1: MyLanguageBest) => Promise<number>>(),
  countRankableByLanguage: vi.fn(),
  findAllByUserId: vi.fn(),
  findMine: vi.fn(),
  findTenthScore: vi.fn(),
  findTopByLanguage: mockFindTop,
  upsertIfBest: vi.fn(),
}

const mockHallOfFameEntryRepository: HallOfFameEntryRepository = {
  findById: vi.fn(),
  findManyByUserIds: mockFindManyByUserIds,
  updateComment: vi.fn(),
  upsertComment: vi.fn(),
}

const buildRepoCollection = () => ({
  hallOfFameEntryRepository: mockHallOfFameEntryRepository,
  languageRepository: mockLanguageRepository,
  userLanguageBestRepository: mockUserLanguageBestRepository,
})

const buildTop = (id: number, score: number): UserLanguageBestWithUser => ({
  accuracy: 0.95,
  bestPlaySessionId: id * 100,
  playedAt: new Date("2026-06-01T00:00:00Z"),
  score,
  typedChars: score,
  user: {
    avatarUrl: null,
    currentGrade: "senior",
    displayName: `u${id}`,
    id,
  },
})

describe("hallOfFame.list", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("TOP 10 + コメントを JOIN して返す", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindTop.mockResolvedValue([buildTop(1, 800), buildTop(2, 600), buildTop(3, 400)])
      mockFindManyByUserIds.mockResolvedValue([
        {
          bestPlaySessionId: 100,
          comment: "OSS をひたすら打って 1 位！",
          commentSubmittedAt: new Date("2026-06-02T00:00:00Z"),
          id: 42,
          languageId: 1,
          userId: 1,
        },
      ])

      const result = await list({ languageSlug: "typescript" }, buildRepoCollection())

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries.map((e) => e.rank)).toEqual([1, 2, 3])
        expect(result.value.entries[0].comment).toBe("OSS をひたすら打って 1 位！")
        expect(result.value.entries[0].entryId).toBe(42)
        expect(result.value.entries[1].comment).toBeNull()
        expect(result.value.entries[1].entryId).toBeNull()
      }
    })

    it("TOP 0 件でも空配列で 200", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindTop.mockResolvedValue([])
      mockFindManyByUserIds.mockResolvedValue([])

      const result = await list({ languageSlug: "typescript" }, buildRepoCollection())

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries).toEqual([])
      }
      expect(mockFindManyByUserIds).toHaveBeenCalledWith([], 1)
    })
  })

  describe("異常系", () => {
    it("存在しない言語で 404 NOT_FOUND", async () => {
      mockFindBySlug.mockResolvedValue(null)

      const result = await list({ languageSlug: "python" }, buildRepoCollection())

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(mockFindTop).not.toHaveBeenCalled()
    })
  })
})
