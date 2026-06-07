import {
  KeystrokeLogRepository,
  PlaySessionProblemRepository,
  PlaySessionRepository,
  ProblemRepository,
  TransactionContext,
  TransactionRunner,
  UserLifetimeStatsRepository,
} from "../../../src/repository/prisma"
import { PlaySessionStateRepository } from "../../../src/repository/redis"
import { finishSession } from "../../../src/service/play-session-service"
import { KeystrokeLog, PlaySessionState } from "../../../src/types/domain"

const mockFindById = vi.fn<(_0: string) => Promise<PlaySessionState | null>>()
const mockDeleteState = vi.fn<(_0: string) => Promise<void>>()
const mockFindManyByIds = vi.fn<(_0: number[]) => Promise<Array<{ id: number; codeBlock: string }>>>()
const mockCreatePlaySession = vi.fn<(_0: unknown, _1?: TransactionContext) => Promise<{ id: number }>>()
const mockCreateProblems = vi.fn<(_0: number, _1: unknown[], _2?: TransactionContext) => Promise<void>>()
const mockCreateKeystrokeLog = vi.fn<(_0: number, _1: KeystrokeLog, _2?: TransactionContext) => Promise<void>>()
const mockUpsertOnFinish = vi.fn<(_0: unknown, _1?: TransactionContext) => Promise<void>>()
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
  create: mockCreateKeystrokeLog,
}

const mockUserLifetimeStatsRepository: UserLifetimeStatsRepository = {
  upsertOnFinish: mockUpsertOnFinish,
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
  userLifetimeStatsRepository: mockUserLifetimeStatsRepository,
})

const validLog: KeystrokeLog = [
  { ch: "a", ok: true, p: 0, t: 100 },
  { ch: "b", ok: true, p: 0, t: 200 },
  { ch: "c", ok: true, p: 0, t: 300 },
]

describe("finishSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    /**
     * デフォルトでは run の中身を実行する fake tx を渡す
     */
    mockTxRun.mockImplementation(async (fn) => fn({} as TransactionContext))
  })

  describe("正常系", () => {
    it("有効な集計値で 4 Repository が tx 付きで呼ばれ、Redis state が削除される", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState())
      mockFindManyByIds.mockResolvedValue([
        { codeBlock: "abc", id: 100 },
        { codeBlock: "def", id: 101 },
      ])
      mockCreatePlaySession.mockResolvedValue({ id: 999 })

      // Act
      const result = await finishSession(
        { accuracy: 0.95, keystrokeLog: validLog, sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 320 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toMatchObject({
          accuracy: 0.95,
          persisted: true,
          score: 304,
          typedChars: 320,
        })
      }
      expect(mockTxRun).toHaveBeenCalledTimes(1)
      expect(mockCreatePlaySession).toHaveBeenCalledTimes(1)
      expect(mockCreateProblems).toHaveBeenCalledTimes(1)
      expect(mockCreateKeystrokeLog).toHaveBeenCalledTimes(1)
      expect(mockUpsertOnFinish).toHaveBeenCalledTimes(1)
      expect(mockDeleteState).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000")
    })

    it("ok=false のキーストロークから正解期待文字単位で mistypeStats が集計される", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState({ problemIds: [100] }))
      mockFindManyByIds.mockResolvedValue([{ codeBlock: "hello", id: 100 }])
      mockCreatePlaySession.mockResolvedValue({ id: 999 })

      // Act
      const result = await finishSession(
        {
          accuracy: 0.83,
          keystrokeLog: [
            { ch: "h", ok: true, p: 0, t: 100 },
            { ch: "e", ok: true, p: 0, t: 200 },
            { ch: "l", ok: true, p: 0, t: 300 },
            { ch: "k", ok: false, p: 0, t: 400 },
            { ch: "l", ok: true, p: 0, t: 500 },
            { ch: "o", ok: true, p: 0, t: 600 },
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
        { accuracy: 0.5, keystrokeLog: [], sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 1501 },
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
        { accuracy: 1.5, keystrokeLog: [], sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 100 },
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
        { accuracy: 0.5, keystrokeLog: [], sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 100 },
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
        { accuracy: 0.95, keystrokeLog: validLog, sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 320 },
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
