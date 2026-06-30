import { Storage } from "@repo/storage"

import {
  PublicProfileUser,
  RewardRepository,
  RewardRow,
  UpsertRewardInput,
  UserLifetimeStatsRepository,
  UserLifetimeStatsSummary,
  UserRepository,
} from "../../../src/repository/prisma"
import { createCard } from "../../../src/service/rewards-service"

const mockFindOne = vi.fn<(_0: number, _1: string, _2: Record<string, unknown>) => Promise<RewardRow | null>>()
const mockUpsert = vi.fn<(_0: UpsertRewardInput) => Promise<RewardRow>>()
const mockFindLifetime = vi.fn<(_0: number) => Promise<UserLifetimeStatsSummary | null>>()
const mockFindPublicProfile = vi.fn<(_0: number) => Promise<PublicProfileUser | null>>()
const mockSave = vi.fn<(_0: string, _1: Buffer) => Promise<string>>()

const mockRewardRepository: RewardRepository = {
  findByIds: vi.fn(),
  findByKey: vi.fn(),
  findByUserId: vi.fn(),
  findOneByUserTypePayload: mockFindOne,
  findPendingByUserId: vi.fn(),
  findRecentCompletedByUserId: vi.fn(),
  updateGenerationStatus: vi.fn(),
  upsert: mockUpsert,
  upsertByKey: vi.fn(),
}

const mockUserLifetimeStatsRepository: UserLifetimeStatsRepository = {
  findByUserId: mockFindLifetime,
  upsertOnFinish: vi.fn(),
}

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  delete: vi.fn(),
  findByEmail: vi.fn(),
  findByGithubUsername: vi.fn(),
  findById: vi.fn(),
  findPublicProfile: mockFindPublicProfile,
  update: vi.fn(),
}

const mockCardStorage: Storage = {
  delete: vi.fn(),
  save: mockSave,
}

const buildRepoCollection = () => ({
  cardStorage: mockCardStorage,
  rewardRepository: mockRewardRepository,
  userLifetimeStatsRepository: mockUserLifetimeStatsRepository,
  userRepository: mockUserRepository,
})

describe("rewards.createCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("既存 reward があり assetUrl が立っていれば PNG 再生成せず冪等返却", async () => {
      const existing: RewardRow = {
        assetSvgUrl: null,
        assetUrl: "/cache/rewards/1-42.png",
        generationStatus: "completed",
        grantedAt: new Date(),
        id: 42,
        payload: { grade_slug: "senior" },
        type: "grade_up",
        userId: 1,
      }
      mockFindOne.mockResolvedValue(existing)

      const result = await createCard(
        { payload: { grade_slug: "senior" }, type: "grade_up", userId: 1 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual(existing)
      expect(mockSave).not.toHaveBeenCalled()
      expect(mockUpsert).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("type=card は MVP 未対応で 400", async () => {
      mockFindOne.mockResolvedValue(null)

      const result = await createCard(
        { payload: { milestone_label: "10K" }, type: "card", userId: 1 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
    })

    it("未知の grade_slug で 400", async () => {
      mockFindOne.mockResolvedValue(null)

      const result = await createCard(
        { payload: { grade_slug: "unknown_grade" }, type: "grade_up", userId: 1 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
      }
    })

    it("bestScore が閾値未満で 403", async () => {
      mockFindOne.mockResolvedValue(null)
      mockFindLifetime.mockResolvedValue({
        bestScore: 50,
        currentGrade: "intern",
        currentGradeReachedAt: null,
        lifetimeMistypeStats: {},
        streakDays: 0,
        totalSessions: 1,
        totalTypedChars: BigInt(50),
      })

      const result = await createCard(
        { payload: { grade_slug: "fellow" }, type: "grade_up", userId: 1 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(403)
        expect(result.error.type).toBe("FORBIDDEN")
      }
      expect(mockSave).not.toHaveBeenCalled()
    })
  })
})
