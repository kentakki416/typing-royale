import {
  RewardRepository,
  RewardRow,
} from "../../../src/repository/prisma"
import { listMine } from "../../../src/service/rewards-service"

const mockFindByUserId = vi.fn<(_0: number) => Promise<RewardRow[]>>()

const mockRepo: RewardRepository = {
  findByUserId: mockFindByUserId,
  findOneByUserTypePayload: vi.fn(),
  upsert: vi.fn(),
}

describe("rewards.listMine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("Repository.findByUserId に userId を渡し戻り値を返す", async () => {
      const rows: RewardRow[] = [
        {
          assetUrl: "/cache/rewards/1-42.png",
          grantedAt: new Date("2026-06-08T00:00:00Z"),
          id: 42,
          payload: { grade_slug: "senior" },
          type: "grade_up",
          userId: 1,
        },
      ]
      mockFindByUserId.mockResolvedValue(rows)

      const result = await listMine({ userId: 1 }, { rewardRepository: mockRepo })

      expect(result).toEqual(rows)
      expect(mockFindByUserId).toHaveBeenCalledWith(1)
    })

    it("0 件なら空配列", async () => {
      mockFindByUserId.mockResolvedValue([])

      const result = await listMine({ userId: 1 }, { rewardRepository: mockRepo })

      expect(result).toEqual([])
    })
  })
})
