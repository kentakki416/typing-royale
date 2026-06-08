import { FeaturedReplayRow, ReplayRepository } from "../../../src/repository/prisma"
import { listFeatured } from "../../../src/service/replay-service"

const mockFindFeatured = vi.fn<(_0: { language?: string; limit: number }) => Promise<FeaturedReplayRow[]>>()
const mockFindById = vi.fn()

const mockRepo: ReplayRepository = {
  findById: mockFindById,
  findFeatured: mockFindFeatured,
}

describe("replay.listFeatured", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("repo.findFeatured に input をそのまま渡し戻り値を返す", async () => {
      const rows: FeaturedReplayRow[] = [
        {
          comment: "コメント",
          commentSubmittedAt: new Date("2026-06-08T00:00:00Z"),
          language: { slug: "typescript" },
          playSession: { accuracy: 0.95, id: 42, score: 1200, typedChars: 1250 },
          user: {
            avatarUrl: null,
            currentGrade: "fellow",
            displayName: "Alice",
            id: 1,
          },
        },
      ]
      mockFindFeatured.mockResolvedValue(rows)

      const result = await listFeatured(
        { language: "typescript", limit: 5 },
        { replayRepository: mockRepo },
      )

      expect(result).toEqual(rows)
      expect(mockFindFeatured).toHaveBeenCalledWith({ language: "typescript", limit: 5 })
    })

    it("language 未指定でも repo に undefined をそのまま渡す", async () => {
      mockFindFeatured.mockResolvedValue([])
      await listFeatured({ limit: 10 }, { replayRepository: mockRepo })
      expect(mockFindFeatured).toHaveBeenCalledWith({ language: undefined, limit: 10 })
    })

    it("0 件なら空配列", async () => {
      mockFindFeatured.mockResolvedValue([])
      const result = await listFeatured({ limit: 3 }, { replayRepository: mockRepo })
      expect(result).toEqual([])
    })
  })
})
