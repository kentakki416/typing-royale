import { CardStorage } from "../../../src/lib/card-storage"
import {
  PublicProfileUser,
  RewardRepository,
  RewardRow,
  UserRepository,
} from "../../../src/repository/prisma"
import { reconcilePendingRewards } from "../../../src/service/rewards-service"

const mockFindByKey = vi.fn()
const mockUpsertByKey = vi.fn()
const mockFindPendingByUserId = vi.fn<(_0: number) => Promise<RewardRow[]>>()
const mockSave = vi.fn<(_0: string, _1: Buffer) => Promise<string>>()
const mockFindPublicProfile = vi.fn<(_0: number) => Promise<PublicProfileUser | null>>()

const mockRewardRepository = {
  findByIds: vi.fn(),
  findByKey: mockFindByKey,
  findByUserId: vi.fn(),
  findOneByUserTypePayload: vi.fn(),
  findPendingByUserId: mockFindPendingByUserId,
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

const pendingHofRow = (id: number, rank: number): RewardRow => ({
  assetSvgUrl: null,
  assetUrl: null,
  grantedAt: new Date(),
  id,
  payload: { language: "typescript", rank },
  type: "hall_of_fame_in",
  userId: 1,
})

describe("rewards.reconcilePendingRewards", () => {
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
    mockFindByKey.mockResolvedValue(null)
    mockUpsertByKey.mockImplementation(async (userId, key, asset) => Promise.resolve({
      assetSvgUrl: asset.assetSvgUrl,
      assetUrl: asset.assetUrl,
      grantedAt: new Date(),
      id: 999,
      payload: asset.payload,
      type: key.type,
      userId,
    }))
  })

  describe("正常系", () => {
    it("pending 行が無ければ何もしない", async () => {
      mockFindPendingByUserId.mockResolvedValue([])

      await reconcilePendingRewards(1, repo)

      expect(mockUpsertByKey).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("pending 行を全て再生成する", async () => {
      mockFindPendingByUserId.mockResolvedValue([
        pendingHofRow(10, 3),
        pendingHofRow(11, 5),
      ])

      await reconcilePendingRewards(1, repo)

      expect(mockUpsertByKey).toHaveBeenCalledTimes(2)
    })

    it("grade_up 行は対象外で無視する", async () => {
      mockFindPendingByUserId.mockResolvedValue([
        {
          ...pendingHofRow(10, 3),
          payload: { grade_slug: "senior" },
          type: "grade_up",
        },
      ])

      await reconcilePendingRewards(1, repo)

      expect(mockUpsertByKey).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("1 件目の生成が失敗しても 2 件目は続行する (自己修復の堅牢性)", async () => {
      mockFindPendingByUserId.mockResolvedValue([
        pendingHofRow(10, 3),
        pendingHofRow(11, 5),
      ])
      mockSave.mockRejectedValueOnce(new Error("S3 transient failure"))

      await reconcilePendingRewards(1, repo)

      /** 1 件目で失敗、2 件目で成功 → upsertByKey は 1 回呼ばれる */
      expect(mockSave).toHaveBeenCalledTimes(2)
      expect(mockUpsertByKey).toHaveBeenCalledTimes(1)
    })
  })
})
