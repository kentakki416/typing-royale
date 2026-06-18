import { CardStorage } from "../../../src/lib/card-storage"
import {
  PublicProfileUser,
  RewardRepository,
  RewardRow,
  SpecialBadgeKey,
  UpsertSpecialBadgeAsset,
  UserRepository,
} from "../../../src/repository/prisma"
import { generateReward } from "../../../src/service/rewards-service"

const mockFindByKey = vi.fn<(_0: number, _1: SpecialBadgeKey) => Promise<RewardRow | null>>()
const mockUpsertByKey = vi.fn<(_0: number, _1: SpecialBadgeKey, _2: UpsertSpecialBadgeAsset) => Promise<RewardRow>>()
const mockFindPublicProfile = vi.fn<(_0: number) => Promise<PublicProfileUser | null>>()
const mockSave = vi.fn<(_0: string, _1: Buffer) => Promise<string>>()

const mockRewardRepository = {
  findByIds: vi.fn(),
  findByKey: mockFindByKey,
  findByUserId: vi.fn(),
  findOneByUserTypePayload: vi.fn(),
  findPendingByUserId: vi.fn(),
  upsert: vi.fn(),
  upsertByKey: mockUpsertByKey,
} as unknown as RewardRepository

const mockUserRepository = {
  findPublicProfile: mockFindPublicProfile,
} as unknown as UserRepository

const mockCardStorage: CardStorage = {
  delete: vi.fn(),
  save: mockSave,
}

const repo = {
  cardStorage: mockCardStorage,
  rewardRepository: mockRewardRepository,
  userRepository: mockUserRepository,
}

const completedRow = (id: number, rank: number): RewardRow => ({
  assetSvgUrl: "<svg/>",
  assetUrl: "/cache/rewards/x.png",
  grantedAt: new Date(),
  id,
  payload: { language: "typescript", rank },
  type: "hall_of_fame_in",
  userId: 1,
})

describe("rewards.generateReward", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindPublicProfile.mockResolvedValue({
      avatarUrl: null,
      canPublicRanking: true,
      createdAt: new Date(),
      favoriteRepoUrl: null,
      githubUsername: "alice",
      id: 1,
    } as unknown as PublicProfileUser)
    mockSave.mockResolvedValue("/cache/rewards/x.png")
  })

  describe("正常系", () => {
    it("既存行が完成済み + rank も同じなら冪等返却（再生成しない）", async () => {
      const existing = completedRow(42, 3)
      mockFindByKey.mockResolvedValue(existing)

      const result = await generateReward(
        1,
        { language: "typescript", rank: 3, type: "hall_of_fame_in" },
        repo,
      )

      expect(result.ok).toBe(true)
      expect(mockUpsertByKey).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("既存行が無ければ新規生成して upsertByKey で行を作る", async () => {
      mockFindByKey.mockResolvedValue(null)
      mockUpsertByKey.mockResolvedValue(completedRow(100, 5))

      const result = await generateReward(
        1,
        { language: "typescript", rank: 5, type: "hall_of_fame_in" },
        repo,
      )

      expect(result.ok).toBe(true)
      expect(mockSave).toHaveBeenCalledTimes(1)
      expect(mockUpsertByKey).toHaveBeenCalledWith(
        1,
        { language: "typescript", type: "hall_of_fame_in" },
        expect.objectContaining({
          assetSvgUrl: expect.stringContaining("HALL OF FAME"),
          assetUrl: "/cache/rewards/x.png",
        }),
      )
    })

    it("既存行があり rank が変わっていれば再生成して上書き", async () => {
      mockFindByKey.mockResolvedValue(completedRow(42, 5))
      mockUpsertByKey.mockResolvedValue(completedRow(42, 3))

      const result = await generateReward(
        1,
        { language: "typescript", rank: 3, type: "hall_of_fame_in" },
        repo,
      )

      expect(result.ok).toBe(true)
      expect(mockSave).toHaveBeenCalledTimes(1)
      expect(mockUpsertByKey).toHaveBeenCalledWith(
        1,
        expect.any(Object),
        expect.objectContaining({ payload: { language: "typescript", rank: 3 } }),
      )
    })

    it("monthly_top_ten の生成では year_month が key に含まれ payload にも入る", async () => {
      mockFindByKey.mockResolvedValue(null)
      mockUpsertByKey.mockResolvedValue({
        ...completedRow(101, 7),
        type: "monthly_top_ten",
      })

      await generateReward(
        1,
        { language: "javascript", rank: 7, type: "monthly_top_ten", yearMonth: "2026-06" },
        repo,
      )

      expect(mockUpsertByKey).toHaveBeenCalledWith(
        1,
        { language: "javascript", type: "monthly_top_ten", yearMonth: "2026-06" },
        expect.objectContaining({
          payload: { language: "javascript", rank: 7, year_month: "2026-06" },
        }),
      )
    })
  })

  describe("異常系", () => {
    it("ユーザーが見つからない場合 NOT_FOUND を返す", async () => {
      mockFindByKey.mockResolvedValue(null)
      mockFindPublicProfile.mockResolvedValue(null)

      const result = await generateReward(
        99,
        { language: "typescript", rank: 1, type: "hall_of_fame_in" },
        repo,
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
    })
  })
})
