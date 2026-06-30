import {
  CrawledRepoRepository,
  LanguageRepository,
  ProblemRepository,
} from "../../../src/repository/prisma"
import { PlaySessionStateRepository } from "../../../src/repository/redis"
import { createSoloSession } from "../../../src/service/play-session-service"
import { PlaySessionProblem, PlaySessionState, RepoInfo } from "../../../src/types/domain"

const mockExistsById = vi.fn<(_0: number) => Promise<boolean>>()
const mockPickRandomEligibleByLanguageId = vi.fn<(_0: number) => Promise<{
  id: number
  repoInfo: RepoInfo
} | null>>()
const mockPickRandomByCrawledRepoId = vi.fn<(_0: number, _1: number) => Promise<PlaySessionProblem[]>>()
const mockSave = vi.fn<(_0: string, _1: PlaySessionState, _2: number) => Promise<void>>()

const mockLanguageRepository: LanguageRepository = {
  existsById: mockExistsById,
  findAll: vi.fn(),
  findById: vi.fn(),
  findBySlug: vi.fn(),
}
const mockCrawledRepoRepository: CrawledRepoRepository = {
  countActiveByLanguageId: vi.fn(),
  findActiveByLanguageId: vi.fn(),
  pickRandomEligibleByLanguageId: mockPickRandomEligibleByLanguageId,
}
const mockProblemRepository: ProblemRepository = {
  findManyByIds: vi.fn(),
  pickRandomByCrawledRepoId: mockPickRandomByCrawledRepoId,
}
const mockPlaySessionStateRepository: PlaySessionStateRepository = {
  delete: vi.fn(),
  findById: vi.fn(),
  save: mockSave,
}

const buildProblem = (id: number): PlaySessionProblem => ({
  charCount: 100,
  codeBlock: `function f${id}() {}`,
  functionName: `f${id}`,
  id,
  lineCount: 1,
  orderIndex: 0,
  sourceUrl: `https://github.com/owner/repo/blob/main/f${id}.ts`,
})

const buildRepo = (): { id: number; repoInfo: RepoInfo } => ({
  id: 1,
  repoInfo: {
    description: "desc",
    homepage: null,
    name: "repo",
    owner: "owner",
    stars: 1000,
    topics: ["react"],
  },
})

const buildRepoCollection = () => ({
  crawledRepoRepository: mockCrawledRepoRepository,
  languageRepository: mockLanguageRepository,
  playSessionStateRepository: mockPlaySessionStateRepository,
  problemRepository: mockProblemRepository,
})

describe("createSoloSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("メイン repo から 20 問揃った場合、ok: true と state を返す", async () => {
      // Arrange
      mockExistsById.mockResolvedValue(true)
      mockPickRandomEligibleByLanguageId.mockResolvedValue(buildRepo())
      mockPickRandomByCrawledRepoId.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => buildProblem(i + 1)),
      )

      // Act
      const result = await createSoloSession(
        { languageId: 1, userId: 42 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.problems).toHaveLength(20)
        expect(result.value.problems[0].orderIndex).toBe(0)
        expect(result.value.problems[19].orderIndex).toBe(19)
        expect(result.value.sessionId).toMatch(/^[0-9a-f-]{36}$/)
        expect(result.value.repoInfo).toEqual(buildRepo().repoInfo)
      }
      expect(mockSave).toHaveBeenCalledTimes(1)
    })
  })

  describe("異常系", () => {
    it("存在しない language_id の場合、ok: false / 400 / BAD_REQUEST を返す", async () => {
      // Arrange
      mockExistsById.mockResolvedValue(false)

      // Act
      const result = await createSoloSession(
        { languageId: 999, userId: 42 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("eligible repo が 0 件の場合、ok: false / 404 / NOT_FOUND を返す", async () => {
      // Arrange
      mockExistsById.mockResolvedValue(true)
      mockPickRandomEligibleByLanguageId.mockResolvedValue(null)

      // Act
      const result = await createSoloSession(
        { languageId: 1, userId: 42 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("メイン repo が 20 問未満（pool 仕様上の異常系）の場合、ok: false / 404 を返す", async () => {
      // Arrange
      mockExistsById.mockResolvedValue(true)
      mockPickRandomEligibleByLanguageId.mockResolvedValue(buildRepo())
      mockPickRandomByCrawledRepoId.mockResolvedValue(
        Array.from({ length: 18 }, (_, i) => buildProblem(i + 1)),
      )

      // Act
      const result = await createSoloSession(
        { languageId: 1, userId: 42 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
      }
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("Redis 書き込み失敗時にエラーをスローする", async () => {
      // Arrange
      mockExistsById.mockResolvedValue(true)
      mockPickRandomEligibleByLanguageId.mockResolvedValue(buildRepo())
      mockPickRandomByCrawledRepoId.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => buildProblem(i + 1)),
      )
      mockSave.mockRejectedValue(new Error("Redis connection failed"))

      // Act & Assert
      await expect(
        createSoloSession(
          { languageId: 1, userId: 42 },
          buildRepoCollection(),
        ),
      ).rejects.toThrow()
    })
  })
})
