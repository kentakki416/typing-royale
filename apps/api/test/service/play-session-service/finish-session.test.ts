import {
  KeystrokeLogRepository,
  MyLanguageBest,
  PlaySessionProblemRepository,
  PlaySessionRepository,
  ProblemRepository,
  TransactionContext,
  TransactionRunner,
  UpsertIfBestInput,
  UpsertIfBestResult,
  UpsertOnFinishResult,
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
} from "../../../src/repository/prisma"
import { PlaySessionStateRepository } from "../../../src/repository/redis"
import { finishSession } from "../../../src/service/play-session-service"
import { KeystrokeLogs, PlaySessionState } from "../../../src/types/domain"

const mockFindById = vi.fn<(_0: string) => Promise<PlaySessionState | null>>()
const mockDeleteState = vi.fn<(_0: string) => Promise<void>>()
const mockFindManyByIds = vi.fn<(_0: number[]) => Promise<Array<{ id: number; codeBlock: string }>>>()
const mockCreatePlaySession = vi.fn<(_0: unknown, _1?: TransactionContext) => Promise<{ id: number }>>()
const mockCreateProblems = vi.fn<(_0: number, _1: unknown[], _2?: TransactionContext) => Promise<void>>()
const mockCreateKeystrokeLogs = vi.fn<(_0: number, _1: KeystrokeLogs, _2?: TransactionContext) => Promise<void>>()
const mockUpsertOnFinish = vi.fn<(_0: unknown, _1?: TransactionContext) => Promise<UpsertOnFinishResult>>()
const mockUpsertIfBest = vi.fn<(_0: UpsertIfBestInput, _1?: TransactionContext) => Promise<UpsertIfBestResult>>()
const mockFindMineBest = vi.fn<(_0: number, _1: number) => Promise<MyLanguageBest | null>>()
const mockCountHigherRanked = vi.fn<(_0: number, _1: MyLanguageBest) => Promise<number>>()
const mockFindTenthScore = vi.fn<(_0: number) => Promise<number | null>>()
const mockTxRun = vi.fn<<T>(fn: (tx: TransactionContext) => Promise<T>) => Promise<T>>()

const mockPlaySessionStateRepository: PlaySessionStateRepository = {
  delete: mockDeleteState,
  findById: mockFindById,
  save: vi.fn(),
}

const mockProblemRepository: ProblemRepository = {
  findManyByIds: mockFindManyByIds,
  pickRandomByCrawledRepoId: vi.fn(),
}

const mockPlaySessionRepository: PlaySessionRepository = {
  create: mockCreatePlaySession,
}

const mockPlaySessionProblemRepository: PlaySessionProblemRepository = {
  createMany: mockCreateProblems,
}

const mockKeystrokeLogRepository: KeystrokeLogRepository = {
  create: mockCreateKeystrokeLogs,
}

const mockUserLifetimeStatsRepository: UserLifetimeStatsRepository = {
  findByUserId: vi.fn(),
  upsertOnFinish: mockUpsertOnFinish,
}

const mockUserLanguageBestRepository: UserLanguageBestRepository = {
  countHigherRanked: mockCountHigherRanked,
  countRankableByLanguage: vi.fn(),
  findMine: mockFindMineBest,
  findTenthScore: mockFindTenthScore,
  findTopByLanguage: vi.fn(),
  upsertIfBest: mockUpsertIfBest,
}

/**
 * TransactionRunner はテストでは tx を `{}` として渡し、内部の関数を実行するだけ
 */
const mockTransactionRunner: TransactionRunner = {
  run: mockTxRun as unknown as TransactionRunner["run"],
}

const buildState = (overrides?: Partial<PlaySessionState>): PlaySessionState => ({
  crawledRepoId: 17,
  ghostSessionId: null,
  languageId: 1,
  mode: "solo",
  problemIds: [100, 101],
  userId: 42,
  ...overrides,
})

const buildRepoCollection = () => ({
  keystrokeLogRepository: mockKeystrokeLogRepository,
  playSessionProblemRepository: mockPlaySessionProblemRepository,
  playSessionRepository: mockPlaySessionRepository,
  playSessionStateRepository: mockPlaySessionStateRepository,
  problemRepository: mockProblemRepository,
  transactionRunner: mockTransactionRunner,
  userLanguageBestRepository: mockUserLanguageBestRepository,
  userLifetimeStatsRepository: mockUserLifetimeStatsRepository,
})

const validLog: KeystrokeLogs = [
  { elapsedMs: 100, inputChar: "a", isCorrect: true, problemIndex: 0 },
  { elapsedMs: 200, inputChar: "b", isCorrect: true, problemIndex: 0 },
  { elapsedMs: 300, inputChar: "c", isCorrect: true, problemIndex: 0 },
]

describe("finishSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    /**
     * デフォルトでは run の中身を実行する fake tx を渡す
     */
    mockTxRun.mockImplementation(async (fn) => fn({} as TransactionContext))
    /**
     * step3 で追加された Repository 群のデフォルト戻り値（gradeUp なし / ベスト未更新 / 順位無し）
     */
    mockUpsertOnFinish.mockResolvedValue({ gradeUp: null })
    mockUpsertIfBest.mockResolvedValue({ updated: false })
    mockFindMineBest.mockResolvedValue(null)
    mockCountHigherRanked.mockResolvedValue(0)
    mockFindTenthScore.mockResolvedValue(null)
  })

  describe("正常系", () => {
    it("有効な集計値で 5 Repository が tx 付きで呼ばれ、Redis state が削除される", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState())
      mockFindManyByIds.mockResolvedValue([
        { codeBlock: "abc", id: 100 },
        { codeBlock: "def", id: 101 },
      ])
      mockCreatePlaySession.mockResolvedValue({ id: 999 })

      // Act
      const result = await finishSession(
        { accuracy: 0.95, keystrokeLogs: validLog, sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 320 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toMatchObject({
          accuracy: 0.95,
          bestScoreUpdated: false,
          gradeUp: null,
          newRank: null,
          persisted: true,
          score: 304,
          topTenBoundaryScore: null,
          typedChars: 320,
        })
      }
      expect(mockTxRun).toHaveBeenCalledTimes(1)
      expect(mockCreatePlaySession).toHaveBeenCalledTimes(1)
      expect(mockCreateProblems).toHaveBeenCalledTimes(1)
      expect(mockCreateKeystrokeLogs).toHaveBeenCalledTimes(1)
      expect(mockUpsertOnFinish).toHaveBeenCalledTimes(1)
      expect(mockUpsertIfBest).toHaveBeenCalledTimes(1)
      expect(mockDeleteState).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000")
    })

    it("ベスト更新 + gradeUp が発生したケース、レスポンスに new_rank / grade_up / top_ten_boundary_score が乗る", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState())
      mockFindManyByIds.mockResolvedValue([
        { codeBlock: "abc", id: 100 },
        { codeBlock: "def", id: 101 },
      ])
      mockCreatePlaySession.mockResolvedValue({ id: 999 })
      mockUpsertIfBest.mockResolvedValue({ updated: true })
      mockUpsertOnFinish.mockResolvedValue({
        gradeUp: {
          from: { level: 4, name: "Senior Engineer", slug: "senior", threshold: 400 },
          to: { level: 5, name: "Staff Engineer", slug: "staff", threshold: 600 },
        },
      })
      mockFindMineBest.mockResolvedValue({
        accuracy: 0.95,
        bestPlaySessionId: 999,
        playedAt: new Date(),
        score: 600,
        typedChars: 632,
      })
      mockCountHigherRanked.mockResolvedValue(86)
      mockFindTenthScore.mockResolvedValue(540)

      // Act
      const result = await finishSession(
        { accuracy: 0.95, keystrokeLogs: validLog, sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 632 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.bestScoreUpdated).toBe(true)
        expect(result.value.newRank).toBe(87)
        expect(result.value.topTenBoundaryScore).toBe(540)
        expect(result.value.gradeUp).toEqual({
          from: { level: 4, name: "Senior Engineer", slug: "senior" },
          to: { level: 5, name: "Staff Engineer", slug: "staff" },
        })
      }
    })

    it("isCorrect=false のキーストロークから正解期待文字単位で mistypeStats が集計される", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState({ problemIds: [100] }))
      mockFindManyByIds.mockResolvedValue([{ codeBlock: "hello", id: 100 }])
      mockCreatePlaySession.mockResolvedValue({ id: 999 })

      // Act
      const result = await finishSession(
        {
          accuracy: 0.83,
          keystrokeLogs: [
            { elapsedMs: 100, inputChar: "h", isCorrect: true, problemIndex: 0 },
            { elapsedMs: 200, inputChar: "e", isCorrect: true, problemIndex: 0 },
            { elapsedMs: 300, inputChar: "l", isCorrect: true, problemIndex: 0 },
            { elapsedMs: 400, inputChar: "k", isCorrect: false, problemIndex: 0 },
            { elapsedMs: 500, inputChar: "l", isCorrect: true, problemIndex: 0 },
            { elapsedMs: 600, inputChar: "o", isCorrect: true, problemIndex: 0 },
          ],
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          typedChars: 5,
        },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        /**
         * 「l を打つべきところを k で誤入力」→ 期待文字 "l" を加算
         */
        expect(result.value.mistypeStats).toEqual({ l: 1 })
      }
    })
  })

  describe("異常系", () => {
    it("typedChars=1501 の場合、ok: false / 400 を返し transaction が実行されない", async () => {
      // Act
      const result = await finishSession(
        { accuracy: 0.5, keystrokeLogs: [], sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 1501 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
      }
      expect(mockTxRun).not.toHaveBeenCalled()
    })

    it("accuracy=1.5 の場合、400 を返す", async () => {
      // Act
      const result = await finishSession(
        { accuracy: 1.5, keystrokeLogs: [], sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 100 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
      }
    })

    it("Redis state が無い場合、404 を返す", async () => {
      // Arrange
      mockFindById.mockResolvedValue(null)

      // Act
      const result = await finishSession(
        { accuracy: 0.5, keystrokeLogs: [], sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 100 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(mockTxRun).not.toHaveBeenCalled()
    })

    it("問題セット mismatch の場合、404 を返す", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState({ problemIds: [100, 101, 102] }))
      /**
       * 期待 3 件のうち 2 件しか取れない
       */
      mockFindManyByIds.mockResolvedValue([
        { codeBlock: "abc", id: 100 },
        { codeBlock: "def", id: 101 },
      ])

      // Act
      const result = await finishSession(
        { accuracy: 0.95, keystrokeLogs: validLog, sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 320 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
      }
      expect(mockTxRun).not.toHaveBeenCalled()
    })
  })
})
