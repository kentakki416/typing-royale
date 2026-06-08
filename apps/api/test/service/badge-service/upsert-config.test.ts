import {
  BadgeConfigRepository,
  BadgeConfigRow,
} from "../../../src/repository/prisma"
import { upsertConfig } from "../../../src/service/badge-service"

const mockUpsert = vi.fn<(_0: number, _1: { displayItems: string[]; theme: string }) => Promise<BadgeConfigRow>>()

const mockRepo: BadgeConfigRepository = {
  findByUserId: vi.fn(),
  upsert: mockUpsert,
}

describe("badge.upsertConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("Repository.upsert に値を渡し戻り値を返す", async () => {
      const expected: BadgeConfigRow = {
        displayItems: ["grade", "rank"],
        theme: "light",
        updatedAt: new Date("2026-06-08T12:00:00Z"),
      }
      mockUpsert.mockResolvedValue(expected)

      const result = await upsertConfig(
        { displayItems: ["grade", "rank"], theme: "light", userId: 42 },
        { badgeConfigRepository: mockRepo },
      )

      expect(result).toEqual(expected)
      expect(mockUpsert).toHaveBeenCalledWith(42, { displayItems: ["grade", "rank"], theme: "light" })
    })
  })
})
