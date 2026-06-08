import {
  HallOfFameEntryRepository,
  HallOfFameEntryRow,
  LanguageRef,
  LanguageRepository,
} from "../../../src/repository/prisma"
import { updateComment } from "../../../src/service/hall-of-fame-service"

const mockFindById = vi.fn<(_0: number) => Promise<HallOfFameEntryRow | null>>()
const mockUpdateComment = vi.fn<(_0: number, _1: string) => Promise<HallOfFameEntryRow>>()
const mockFindLanguageById = vi.fn<(_0: number) => Promise<LanguageRef | null>>()

const mockHallOfFameEntryRepository: HallOfFameEntryRepository = {
  findById: mockFindById,
  findManyByUserIds: vi.fn(),
  updateComment: mockUpdateComment,
  upsertComment: vi.fn(),
}

const mockLanguageRepository: LanguageRepository = {
  existsById: vi.fn(),
  findById: mockFindLanguageById,
  findBySlug: vi.fn(),
}

const buildRepoCollection = () => ({
  hallOfFameEntryRepository: mockHallOfFameEntryRepository,
  languageRepository: mockLanguageRepository,
})

const buildEntry = (overrides?: Partial<HallOfFameEntryRow>): HallOfFameEntryRow => ({
  bestPlaySessionId: 100,
  comment: "old",
  commentSubmittedAt: new Date("2026-06-01"),
  id: 42,
  languageId: 1,
  userId: 5,
  ...overrides,
})

describe("hallOfFame.updateComment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("自分の entry を編集する", async () => {
      mockFindById.mockResolvedValue(buildEntry())
      mockFindLanguageById.mockResolvedValue({ id: 1, slug: "typescript" })
      mockUpdateComment.mockResolvedValue(buildEntry({ comment: "new" }))

      const result = await updateComment(
        { comment: "new", entryId: 42, userId: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.comment).toBe("new")
        expect(result.value.languageSlug).toBe("typescript")
      }
      expect(mockUpdateComment).toHaveBeenCalledWith(42, "new")
    })
  })

  describe("異常系", () => {
    it("NG ワードを含むと 400", async () => {
      const result = await updateComment(
        { comment: "死ねよ", entryId: 42, userId: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
      }
      expect(mockFindById).not.toHaveBeenCalled()
    })

    it("entry が存在しないと 404", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await updateComment(
        { comment: "OK", entryId: 9999, userId: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
      }
    })

    it("他人の entry を編集しようとすると 403", async () => {
      mockFindById.mockResolvedValue(buildEntry({ userId: 99 }))

      const result = await updateComment(
        { comment: "OK", entryId: 42, userId: 5 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(403)
        expect(result.error.type).toBe("FORBIDDEN")
      }
      expect(mockUpdateComment).not.toHaveBeenCalled()
    })
  })
})
