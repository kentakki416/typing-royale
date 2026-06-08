import {
  HallOfFameEntryRepository,
  HallOfFameEntryRow,
  LanguageRef,
  LanguageRepository,
  MyLanguageBest,
  UpsertHallOfFameCommentInput,
  UserLanguageBestRepository,
} from "../../../src/repository/prisma"
import { submitComment } from "../../../src/service/hall-of-fame-service"

const mockFindBySlug = vi.fn<(_0: string) => Promise<LanguageRef | null>>()
const mockFindMine = vi.fn<(_0: number, _1: number) => Promise<MyLanguageBest | null>>()
const mockUpsertComment = vi.fn<(_0: UpsertHallOfFameCommentInput) => Promise<HallOfFameEntryRow>>()

const mockLanguageRepository: LanguageRepository = {
  existsById: vi.fn(),
  findById: vi.fn(),
  findBySlug: mockFindBySlug,
}

const mockUserLanguageBestRepository: UserLanguageBestRepository = {
  countHigherRanked: vi.fn(),
  countRankableByLanguage: vi.fn(),
  findAllByUserId: vi.fn(),
  findMine: mockFindMine,
  findTenthScore: vi.fn(),
  findTopByLanguage: vi.fn(),
  upsertIfBest: vi.fn(),
}

const mockHallOfFameEntryRepository: HallOfFameEntryRepository = {
  findById: vi.fn(),
  findManyByUserIds: vi.fn(),
  updateComment: vi.fn(),
  upsertComment: mockUpsertComment,
}

const buildRepoCollection = () => ({
  hallOfFameEntryRepository: mockHallOfFameEntryRepository,
  languageRepository: mockLanguageRepository,
  userLanguageBestRepository: mockUserLanguageBestRepository,
})

describe("hallOfFame.submitComment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("upsert して entryId / comment / commentSubmittedAt を返す", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindMine.mockResolvedValue({
        accuracy: 0.95,
        bestPlaySessionId: 100,
        playedAt: new Date(),
        score: 800,
        typedChars: 800,
      })
      mockUpsertComment.mockResolvedValue({
        bestPlaySessionId: 100,
        comment: "OSS をひたすら打って 1 位！",
        commentSubmittedAt: new Date("2026-06-02T00:00:00Z"),
        id: 42,
        languageId: 1,
        userId: 5,
      })

      const result = await submitComment(
        { comment: "OSS をひたすら打って 1 位！", languageSlug: "typescript", userId: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entryId).toBe(42)
        expect(result.value.comment).toBe("OSS をひたすら打って 1 位！")
        expect(result.value.languageSlug).toBe("typescript")
      }
      expect(mockUpsertComment).toHaveBeenCalledWith({
        bestPlaySessionId: 100,
        comment: "OSS をひたすら打って 1 位！",
        languageId: 1,
        userId: 5,
      })
    })
  })

  describe("異常系", () => {
    it("NG ワードが含まれていれば 400 BAD_REQUEST", async () => {
      const result = await submitComment(
        { comment: "お前なんか死ね", languageSlug: "typescript", userId: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(mockFindBySlug).not.toHaveBeenCalled()
    })

    it("存在しない言語で 404 NOT_FOUND", async () => {
      mockFindBySlug.mockResolvedValue(null)

      const result = await submitComment(
        { comment: "OK", languageSlug: "python", userId: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
      }
    })

    it("該当言語のベストが無いユーザーで 409 CONFLICT", async () => {
      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindMine.mockResolvedValue(null)

      const result = await submitComment(
        { comment: "OK", languageSlug: "typescript", userId: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(mockUpsertComment).not.toHaveBeenCalled()
    })
  })
})
