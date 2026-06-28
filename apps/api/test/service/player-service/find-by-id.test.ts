import {
  MyLanguageBest,
  PublicProfileUser,
  UserLanguageBestRepository,
  UserLanguageBestWithLanguage,
  UserLifetimeStatsRepository,
  UserLifetimeStatsSummary,
  UserRepository,
} from "../../../src/repository/prisma"
import { findById } from "../../../src/service/player-service"

const mockFindPublicProfile = vi.fn<(_0: number) => Promise<PublicProfileUser | null>>()
const mockFindByUserId = vi.fn<(_0: number) => Promise<UserLifetimeStatsSummary | null>>()
const mockFindAllByUserId = vi.fn<(_0: number) => Promise<UserLanguageBestWithLanguage[]>>()
const mockCountHigherRanked = vi.fn<(_0: number, _1: MyLanguageBest) => Promise<number>>()

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  delete: vi.fn(),
  findByEmail: vi.fn(),
  findById: vi.fn(),
  findPublicProfile: mockFindPublicProfile,
  update: vi.fn(),
}

const mockUserLifetimeStatsRepository: UserLifetimeStatsRepository = {
  findByUserId: mockFindByUserId,
  upsertOnFinish: vi.fn(),
}

const mockUserLanguageBestRepository: UserLanguageBestRepository = {
  countHigherRanked: mockCountHigherRanked,
  countRankableByLanguage: vi.fn(),
  findAllByUserId: mockFindAllByUserId,
  findMine: vi.fn(),
  findTenthScore: vi.fn(),
  findTopByLanguage: vi.fn(),
  upsertIfBest: vi.fn(),
}

const buildRepoCollection = () => ({
  userLanguageBestRepository: mockUserLanguageBestRepository,
  userLifetimeStatsRepository: mockUserLifetimeStatsRepository,
  userRepository: mockUserRepository,
})

describe("player.findById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("公開ユーザーの user / lifetime_stats / language_bests を組み立てて返す", async () => {
      mockFindPublicProfile.mockResolvedValue({
        id: 12,
        avatarUrl: "https://example.com/a.jpg",
        canPublicRanking: true,
        createdAt: new Date("2026-01-08T00:00:00Z"),
        favoriteRepoUrl: "https://github.com/sakurai_dev/awesome",
        githubUsername: "sakurai_dev",
      })
      mockFindByUserId.mockResolvedValue({
        bestScore: 1490,
        currentGrade: "fellow",
        currentGradeReachedAt: new Date("2026-05-12T03:21:11Z"),
        streakDays: 28,
        totalSessions: 142,
        totalTypedChars: BigInt(512847),
      })
      mockFindAllByUserId.mockResolvedValue([
        {
          accuracy: 0.98,
          bestPlaySessionId: 8732,
          language: { id: 1, name: "TypeScript", slug: "typescript" },
          languageId: 1,
          playedAt: new Date("2026-06-03T02:14:08Z"),
          score: 1490,
          typedChars: 1520,
        },
      ])
      mockCountHigherRanked.mockResolvedValue(0)

      const result = await findById({ userId: 12 }, buildRepoCollection())

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.user.githubUsername).toBe("sakurai_dev")
        expect(result.value.user.favoriteRepoUrl).toBe("https://github.com/sakurai_dev/awesome")
        expect(result.value.lifetimeStats.bestScore).toBe(1490)
        expect(result.value.lifetimeStats.currentGrade.slug).toBe("fellow")
        expect(result.value.lifetimeStats.totalTypedChars).toBe(512847)
        expect(result.value.languageBests).toHaveLength(1)
        expect(result.value.languageBests[0].rank).toBe(1)
      }
    })

    it("lifetime_stats が未保存（プレイ前ユーザー）なら 0 埋め + Intern を返す", async () => {
      mockFindPublicProfile.mockResolvedValue({
        id: 5,
        avatarUrl: null,
        canPublicRanking: true,
        createdAt: new Date("2026-06-01T00:00:00Z"),
        favoriteRepoUrl: null,
        githubUsername: "newbie",
      })
      mockFindByUserId.mockResolvedValue(null)
      mockFindAllByUserId.mockResolvedValue([])

      const result = await findById({ userId: 5 }, buildRepoCollection())

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.lifetimeStats).toEqual({
          bestScore: 0,
          currentGrade: { level: 1, name: "Intern", slug: "intern", threshold: 0 },
          currentGradeReachedAt: null,
          streakDays: 0,
          totalSessions: 0,
          totalTypedChars: 0,
        })
        expect(result.value.languageBests).toEqual([])
      }
    })
  })

  describe("異常系", () => {
    it("ユーザー不在なら ok: false / 404 / NOT_FOUND を返す", async () => {
      mockFindPublicProfile.mockResolvedValue(null)

      const result = await findById({ userId: 9999 }, buildRepoCollection())

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(mockFindByUserId).not.toHaveBeenCalled()
    })

    it("canPublicRanking=false なら 404 を返す（プライバシー保護）", async () => {
      mockFindPublicProfile.mockResolvedValue({
        id: 7,
        avatarUrl: null,
        canPublicRanking: false,
        createdAt: new Date(),
        favoriteRepoUrl: null,
        githubUsername: "hidden_user",
      })

      const result = await findById({ userId: 7 }, buildRepoCollection())

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
      }
      expect(mockFindByUserId).not.toHaveBeenCalled()
    })
  })
})
