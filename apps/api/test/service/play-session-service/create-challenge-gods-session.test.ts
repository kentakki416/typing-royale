import {
  GhostSourceSession,
  KeystrokeLogRepository,
  LanguageRepository,
  PlaySessionRepository,
  ProblemRepository,
  RankingSnapshotRepository,
  RankingTopEntry,
} from "../../../src/repository/prisma"
import { FoundProblem } from "../../../src/repository/prisma/problem-repository"
import { PlaySessionStateRepository } from "../../../src/repository/redis"
import { createChallengeGodsSession } from "../../../src/service/play-session-service"
import { KeystrokeLogs, PlaySessionState, RepoInfo } from "../../../src/types/domain"

const mockExistsById = vi.fn<(_0: number) => Promise<boolean>>()
const mockGetTopByLanguage = vi.fn<(_0: number, _1: number) => Promise<RankingTopEntry[]>>()
const mockFindGhostSourceById = vi.fn<(_0: number) => Promise<GhostSourceSession | null>>()
const mockFindByPlaySessionId = vi.fn<(_0: number) => Promise<KeystrokeLogs | null>>()
const mockFindManyByIds = vi.fn<(_0: number[]) => Promise<FoundProblem[]>>()
const mockSave = vi.fn<(_0: string, _1: PlaySessionState, _2: number) => Promise<void>>()

const mockLanguageRepository: LanguageRepository = { existsById: mockExistsById }
const mockRankingSnapshotRepository: RankingSnapshotRepository = { getTopByLanguage: mockGetTopByLanguage }
const mockPlaySessionRepository: PlaySessionRepository = {
  create: vi.fn(),
  findGhostSourceById: mockFindGhostSourceById,
}
const mockKeystrokeLogRepository: KeystrokeLogRepository = {
  create: vi.fn(),
  findByPlaySessionId: mockFindByPlaySessionId,
}
const mockProblemRepository: ProblemRepository = {
  findManyByIds: mockFindManyByIds,
  pickRandomByCrawledRepoId: vi.fn(),
}
const mockPlaySessionStateRepository: PlaySessionStateRepository = {
  delete: vi.fn(),
  findById: vi.fn(),
  save: mockSave,
}

const repoInfo: RepoInfo = {
  description: "Test repo",
  homepage: null,
  name: "repo",
  owner: "owner",
  stars: 100,
  topics: ["typescript"],
}

const buildTopEntry = (userId: number, bestPlaySessionId: number): RankingTopEntry => ({
  bestPlaySessionId,
  bestScore: 800,
  userDisplay: {
    avatarUrl: null,
    currentGrade: "Staff Engineer",
    githubUsername: `god${userId}`,
  },
  userId,
})

const buildGhostSession = (id: number, problemIds: number[]): GhostSourceSession => ({
  crawledRepo: repoInfo,
  crawledRepoId: 17,
  id,
  languageId: 1,
  playedAt: new Date("2026-06-01T00:00:00.000Z"),
  problemIds,
})

const buildProblem = (id: number): FoundProblem => ({
  charCount: 50,
  codeBlock: `const f${id} = () => ${id}`,
  functionName: `f${id}`,
  id,
  lineCount: 1,
  sourceUrl: `https://github.com/owner/repo/blob/main/f${id}.ts`,
})

const buildRepoCollection = () => ({
  keystrokeLogRepository: mockKeystrokeLogRepository,
  languageRepository: mockLanguageRepository,
  playSessionRepository: mockPlaySessionRepository,
  playSessionStateRepository: mockPlaySessionStateRepository,
  problemRepository: mockProblemRepository,
  rankingSnapshotRepository: mockRankingSnapshotRepository,
})

const sampleLogs: KeystrokeLogs = [
  { elapsedMs: 100, inputChar: "c", isCorrect: true, problemIndex: 0 },
]

describe("createChallengeGodsSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("候補から 1 人選び、Redis state を mode=challenge_gods で保存する", async () => {
      // Arrange
      mockExistsById.mockResolvedValue(true)
      mockGetTopByLanguage.mockResolvedValue([buildTopEntry(99, 1000)])
      const problemIds = Array.from({ length: 20 }, (_, i) => 100 + i)
      mockFindGhostSourceById.mockResolvedValue(buildGhostSession(1000, problemIds))
      mockFindByPlaySessionId.mockResolvedValue(sampleLogs)
      mockFindManyByIds.mockResolvedValue(problemIds.map(buildProblem))

      // Act
      const result = await createChallengeGodsSession(
        { languageId: 1, userId: 42 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.problems).toHaveLength(20)
        expect(result.value.problems[0].orderIndex).toBe(0)
        expect(result.value.problems[19].orderIndex).toBe(19)
        expect(result.value.ghostSessionId).toBe(1000)
        expect(result.value.ghostUserDisplay.githubUsername).toBe("god99")
      }
      expect(mockSave).toHaveBeenCalledTimes(1)
      const [, savedState] = mockSave.mock.calls[0]
      expect(savedState).toMatchObject({
        ghostSessionId: 1000,
        mode: "challenge_gods",
        userId: 42,
      })
    })

    it("自分自身は候補から除外される", async () => {
      // Arrange
      mockExistsById.mockResolvedValue(true)
      /**
       * 1 人目は自分 → 除外。2 人目が選ばれる
       */
      mockGetTopByLanguage.mockResolvedValue([
        buildTopEntry(42, 900),
        buildTopEntry(99, 1000),
      ])
      const problemIds = Array.from({ length: 20 }, (_, i) => 100 + i)
      mockFindGhostSourceById.mockResolvedValue(buildGhostSession(1000, problemIds))
      mockFindByPlaySessionId.mockResolvedValue(sampleLogs)
      mockFindManyByIds.mockResolvedValue(problemIds.map(buildProblem))

      // Act
      const result = await createChallengeGodsSession(
        { languageId: 1, userId: 42 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
      /**
       * 自分の bestPlaySessionId=900 では引かれない
       */
      expect(mockFindGhostSourceById).toHaveBeenCalledWith(1000)
      expect(mockFindGhostSourceById).not.toHaveBeenCalledWith(900)
    })
  })

  describe("異常系", () => {
    it("language_id が不正なら 400 を返す", async () => {
      mockExistsById.mockResolvedValue(false)

      const result = await createChallengeGodsSession(
        { languageId: 999, userId: 42 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("ランキングが空（Stub 状態）なら 409 を返す", async () => {
      mockExistsById.mockResolvedValue(true)
      mockGetTopByLanguage.mockResolvedValue([])

      const result = await createChallengeGodsSession(
        { languageId: 1, userId: 42 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
    })

    it("候補が自分のみ（除外後 0 件）なら 409 を返す", async () => {
      mockExistsById.mockResolvedValue(true)
      mockGetTopByLanguage.mockResolvedValue([buildTopEntry(42, 900)])

      const result = await createChallengeGodsSession(
        { languageId: 1, userId: 42 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
      }
    })

    it("全候補で keystroke log が取れなければ 409 を返す", async () => {
      mockExistsById.mockResolvedValue(true)
      mockGetTopByLanguage.mockResolvedValue([buildTopEntry(99, 1000), buildTopEntry(100, 1001)])
      mockFindGhostSourceById.mockResolvedValue(buildGhostSession(1000, [100]))
      mockFindByPlaySessionId.mockResolvedValue(null)

      const result = await createChallengeGodsSession(
        { languageId: 1, userId: 42 },
        buildRepoCollection(),
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
      }
      expect(mockSave).not.toHaveBeenCalled()
    })
  })
})
