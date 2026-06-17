import {
  BadgeConfigRepository,
  BadgeConfigRow,
  LanguageRef,
  LanguageRepository,
  MyLanguageBest,
  PublicProfileUser,
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
  UserLifetimeStatsSummary,
  UserRepository,
} from "../../../src/repository/prisma"
import { render } from "../../../src/service/badge-service"

const mockFindByGithubUsername = vi.fn<(_0: string) => Promise<PublicProfileUser | null>>()
const mockFindLifetimeStats = vi.fn<(_0: number) => Promise<UserLifetimeStatsSummary | null>>()
const mockFindBadgeConfig = vi.fn<(_0: number) => Promise<BadgeConfigRow | null>>()
const mockFindBySlug = vi.fn<(_0: string) => Promise<LanguageRef | null>>()
const mockFindMine = vi.fn<(_0: number, _1: number) => Promise<MyLanguageBest | null>>()
const mockCountHigherRanked = vi.fn<(_0: number, _1: MyLanguageBest) => Promise<number>>()

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  delete: vi.fn(),
  findByGithubUsername: mockFindByGithubUsername,
  findByEmail: vi.fn(),
  findById: vi.fn(),
  findPublicProfile: vi.fn(),
  update: vi.fn(),
}

const mockUserLifetimeStatsRepository: UserLifetimeStatsRepository = {
  findByUserId: mockFindLifetimeStats,
  upsertOnFinish: vi.fn(),
}

const mockBadgeConfigRepository: BadgeConfigRepository = {
  findByUserId: mockFindBadgeConfig,
  upsert: vi.fn(),
}

const mockLanguageRepository: LanguageRepository = {
  existsById: vi.fn(),
  findBySlug: mockFindBySlug,
}

const mockUserLanguageBestRepository: UserLanguageBestRepository = {
  countHigherRanked: mockCountHigherRanked,
  countRankableByLanguage: vi.fn(),
  findAllByUserId: vi.fn(),
  findMine: mockFindMine,
  findTenthScore: vi.fn(),
  findTopByLanguage: vi.fn(),
  upsertIfBest: vi.fn(),
}

const buildRepoCollection = () => ({
  badgeConfigRepository: mockBadgeConfigRepository,
  languageRepository: mockLanguageRepository,
  userLanguageBestRepository: mockUserLanguageBestRepository,
  userLifetimeStatsRepository: mockUserLifetimeStatsRepository,
  userRepository: mockUserRepository,
})

describe("badge.render", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("公開ユーザー (config / stats あり) で SVG を生成する", async () => {
      mockFindByGithubUsername.mockResolvedValue({
        id: 1,
        avatarUrl: null,
        canPublicRanking: true,
        createdAt: new Date(),
        githubUsername: "alice",
      })
      mockFindLifetimeStats.mockResolvedValue({
        bestScore: 543,
        currentGrade: "senior",
        currentGradeReachedAt: null,
        streakDays: 7,
        totalSessions: 12,
        totalTypedChars: BigInt(15000),
      })
      mockFindBadgeConfig.mockResolvedValue({
        displayItems: ["grade", "best_score", "streak_days"],
        updatedAt: new Date(),
      })

      const result = await render({ username: "alice" }, buildRepoCollection())

      expect(result.svg).toContain("<svg")
      expect(result.svg).toContain("Typing Royale")
      expect(result.svg).toContain("Senior Engineer")
      expect(result.svg).toContain("543 pts")
      expect(result.svg).toContain("7 日")
      expect(mockFindBySlug).not.toHaveBeenCalled()
    })

    it("rank が displayItems に含まれるとき TS の順位を算出して埋め込む", async () => {
      mockFindByGithubUsername.mockResolvedValue({
        id: 1,
        avatarUrl: null,
        canPublicRanking: true,
        createdAt: new Date(),
        githubUsername: "alice",
      })
      mockFindLifetimeStats.mockResolvedValue({
        bestScore: 543,
        currentGrade: "senior",
        currentGradeReachedAt: null,
        streakDays: 0,
        totalSessions: 1,
        totalTypedChars: BigInt(100),
      })
      mockFindBadgeConfig.mockResolvedValue({
        displayItems: ["rank"],
        updatedAt: new Date(),
      })

      mockFindBySlug.mockResolvedValue({ id: 1, slug: "typescript" })
      mockFindMine.mockResolvedValue({
        accuracy: 0.95,
        bestPlaySessionId: 100,
        playedAt: new Date(),
        score: 543,
        typedChars: 600,
      })
      mockCountHigherRanked.mockResolvedValue(86)

      const result = await render({ username: "alice" }, buildRepoCollection())

      expect(result.svg).toContain("#87")
    })

    it("badge_configs / lifetime_stats が無くても defaults で SVG を返す", async () => {
      mockFindByGithubUsername.mockResolvedValue({
        id: 1,
        avatarUrl: null,
        canPublicRanking: true,
        createdAt: new Date(),
        githubUsername: "alice",
      })
      mockFindLifetimeStats.mockResolvedValue(null)
      mockFindBadgeConfig.mockResolvedValue(null)

      const result = await render({ username: "alice" }, buildRepoCollection())

      expect(result.svg).toContain("<svg")
      /** default は ["grade", "best_score"] / dark で bestScore=0 → Intern */
      expect(result.svg).toContain("Intern")
      expect(result.svg).toContain("0 pts")
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しないとき private SVG を返す", async () => {
      mockFindByGithubUsername.mockResolvedValue(null)

      const result = await render({ username: "nobody" }, buildRepoCollection())

      expect(result.svg).toContain("Private or not found")
    })

    it("canPublicRanking=false のユーザーで private SVG を返す", async () => {
      mockFindByGithubUsername.mockResolvedValue({
        id: 1,
        avatarUrl: null,
        canPublicRanking: false,
        createdAt: new Date(),
        githubUsername: "hidden",
      })

      const result = await render({ username: "hidden" }, buildRepoCollection())

      expect(result.svg).toContain("Private or not found")
      expect(mockFindLifetimeStats).not.toHaveBeenCalled()
    })
  })
})
