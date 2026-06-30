import type { GenerateRewardJobData, JobQueue } from "@repo/queue"

import {
  FoundProblem,
  KeystrokeLogRepository,
  MonthlyRankingSnapshotRepository,
  MyLanguageBest,
  PlaySessionProblemRepository,
  PlaySessionRepository,
  ProblemRepository,
  RewardRepository,
  TransactionContext,
  TransactionRunner,
  UpsertIfBestInput,
  UpsertIfBestResult,
  UpsertMonthlySnapshotInput,
  UpsertOnFinishResult,
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../../../src/repository/prisma"
import { PlaySessionStateRepository } from "../../../src/repository/redis"
import { finishSession } from "../../../src/service/play-session-service"
import { KeystrokeLogs, PlaySessionState } from "../../../src/types/domain"

const mockFindById = vi.fn<(_0: string) => Promise<PlaySessionState | null>>()
const mockDeleteState = vi.fn<(_0: string) => Promise<void>>()
const mockFindManyByIds = vi.fn<(_0: number[]) => Promise<FoundProblem[]>>()

/**
 * /finish では codeBlock のみ使うため、それ以外の FoundProblem 必須フィールドは
 * ダミー値で埋めるヘルパ（型を現行ソースに揃える）
 */
const buildFound = (id: number, codeBlock: string): FoundProblem => ({
  charCount: codeBlock.length,
  codeBlock,
  functionName: `f${id}`,
  id,
  languageId: 1,
  lineCount: 1,
  sourceUrl: `https://github.com/owner/repo/blob/main/f${id}.ts`,
})
const mockCreatePlaySession = vi.fn<(_0: unknown, _1?: TransactionContext) => Promise<{ id: number }>>()
const mockCreateProblems = vi.fn<(_0: number, _1: unknown[], _2?: TransactionContext) => Promise<void>>()
const mockCreateKeystrokeLogs = vi.fn<(_0: number, _1: KeystrokeLogs, _2?: TransactionContext) => Promise<void>>()
const mockUpsertOnFinish = vi.fn<(_0: unknown, _1?: TransactionContext) => Promise<UpsertOnFinishResult>>()
const mockUpsertIfBest = vi.fn<(_0: UpsertIfBestInput, _1?: TransactionContext) => Promise<UpsertIfBestResult>>()
const mockFindMineBest = vi.fn<(_0: number, _1: number) => Promise<MyLanguageBest | null>>()
const mockCountHigherRanked = vi.fn<(_0: number, _1: MyLanguageBest) => Promise<number>>()
const mockFindTenthScore = vi.fn<(_0: number) => Promise<number | null>>()
const mockCountRankableByLanguage = vi.fn<(_0: number) => Promise<number>>()
const mockMonthlyCountByLanguage = vi.fn<(_0: string, _1: number) => Promise<number>>()
const mockMonthlyFindBoundaryScore = vi.fn<(_0: string, _1: number, _2: number) => Promise<number | null>>()
const mockMonthlyUpsertForUser = vi.fn<(_0: UpsertMonthlySnapshotInput, _1?: TransactionContext) => Promise<void>>()
const mockMonthlyDeleteLowestExcluding = vi.fn<(_0: string, _1: number, _2: number, _3?: TransactionContext) => Promise<void>>()
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
  findGhostSourceById: vi.fn(),
  getUserSummaryStats: vi.fn(),
}

const mockPlaySessionProblemRepository: PlaySessionProblemRepository = {
  createMany: mockCreateProblems,
}

const mockKeystrokeLogRepository: KeystrokeLogRepository = {
  create: mockCreateKeystrokeLogs,
  findByPlaySessionId: vi.fn(),
}

const mockUserLifetimeStatsRepository: UserLifetimeStatsRepository = {
  findByUserId: vi.fn(),
  upsertOnFinish: mockUpsertOnFinish,
}

const mockMonthlyRankingSnapshotRepository: MonthlyRankingSnapshotRepository = {
  countByLanguage: mockMonthlyCountByLanguage,
  deleteLowestExcluding: mockMonthlyDeleteLowestExcluding,
  findBoundaryScore: mockMonthlyFindBoundaryScore,
  findTopByLanguage: vi.fn(),
  upsertForUser: mockMonthlyUpsertForUser,
}

const mockUserLanguageBestRepository: UserLanguageBestRepository = {
  countHigherRanked: mockCountHigherRanked,
  countRankableByLanguage: mockCountRankableByLanguage,
  findAllByUserId: vi.fn(),
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

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  delete: vi.fn(),
  findByEmail: vi.fn(),
  findByGithubUsername: vi.fn(),
  findById: vi.fn(),
  findPublicProfile: vi.fn(),
  update: vi.fn(),
}

const mockRewardRepository: RewardRepository = {
  findByIds: vi.fn(),
  findByKey: vi.fn(),
  findByUserId: vi.fn(),
  findOneByUserTypePayload: vi.fn(),
  findPendingByUserId: vi.fn(),
  findRecentCompletedByUserId: vi.fn(),
  updateGenerationStatus: vi.fn(),
  upsert: vi.fn(),
  upsertByKey: vi.fn(),
}

/**
 * rewards-worker step3: pending reward は generate-reward キューに enqueue される。
 * 同期生成しないので enqueue を観測できれば十分（実際の生成は apps/worker のテストで検証）
 */
const mockEnqueue = vi.fn<(_0: GenerateRewardJobData, _1?: unknown) => Promise<void>>()
const mockGenerateRewardQueue: JobQueue<GenerateRewardJobData> = {
  close: vi.fn(),
  enqueue: mockEnqueue,
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

/**
 * special-badges (step2): pending reward 検出のため languageRepository を必要とする。
 * 既存ユニットテストは TS/JS 以外の slug でモック (= null) しておくと、
 * `_toRewardLanguage` で `null` 判定され pending rewards 生成ロジックがスキップされる。
 * これにより既存テストへの影響を最小化する
 */
const mockLanguageRepository = {
  existsById: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn().mockResolvedValue(null),
  findBySlug: vi.fn(),
}

const buildRepoCollection = () => ({
  generateRewardQueue: mockGenerateRewardQueue,
  keystrokeLogRepository: mockKeystrokeLogRepository,
  languageRepository: mockLanguageRepository,
  monthlyRankingSnapshotRepository: mockMonthlyRankingSnapshotRepository,
  playSessionProblemRepository: mockPlaySessionProblemRepository,
  playSessionRepository: mockPlaySessionRepository,
  playSessionStateRepository: mockPlaySessionStateRepository,
  problemRepository: mockProblemRepository,
  rewardRepository: mockRewardRepository,
  transactionRunner: mockTransactionRunner,
  userLanguageBestRepository: mockUserLanguageBestRepository,
  userLifetimeStatsRepository: mockUserLifetimeStatsRepository,
  userRepository: mockUserRepository,
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
     * 言語マスタはデフォルトで null（言語不明 = special-badges 対象外）に戻す。
     * vi.clearAllMocks() は実装を初期化しないため、個別テストで findById を上書きした
     * 後でも他テストへ漏れないよう beforeEach で明示的に再設定する
     */
    mockLanguageRepository.findById.mockResolvedValue(null)
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
    mockCountRankableByLanguage.mockResolvedValue(0)
    /**
     * monthly snapshot は v2 で /finish 同期 UPSERT になった。デフォルトは空状態
     * (件数 0 / boundary null) で、入賞時に upsert が走り cap 超過は無し
     */
    mockMonthlyCountByLanguage.mockResolvedValue(0)
    mockMonthlyFindBoundaryScore.mockResolvedValue(null)
    mockMonthlyUpsertForUser.mockResolvedValue(undefined)
    mockMonthlyDeleteLowestExcluding.mockResolvedValue(undefined)
    /**
     * rewards-worker step3: gradeUp 時に grade_up の pending 行を確保する。
     * 既存なし (null) → upsert で新規 pending 行を返すデフォルトにしておく
     */
    ;(mockRewardRepository.findOneByUserTypePayload as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(mockRewardRepository.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      assetSvgUrl: null,
      assetUrl: null,
      generationStatus: "pending",
      grantedAt: new Date(),
      id: 777,
      payload: { grade_slug: "staff" },
      type: "grade_up",
      userId: 42,
    })
  })

  describe("正常系", () => {
    it("有効な集計値で 5 Repository が tx 付きで呼ばれ、Redis state が削除される", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState())
      mockFindManyByIds.mockResolvedValue([
        buildFound(100, "abc"),
        buildFound(101, "def"),
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
        buildFound(100, "abc"),
        buildFound(101, "def"),
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
        /** grade_up が pending_rewards に積まれる (worker が後段で生成) */
        expect(result.value.pendingRewards).toContainEqual({
          gradeSlug: "staff",
          rewardId: 777,
          type: "grade_up",
        })
      }
      /** rewards-worker step3: 同期生成せず generate-reward キューに enqueue する */
      expect(mockEnqueue).toHaveBeenCalledWith(
        { rewardId: 777 },
        expect.objectContaining({ jobId: expect.any(String) }),
      )
    })

    it("override の無い言語 (go) で 10 位以内に入賞すると hall_of_fame_in の pending reward が確保され enqueue される（言語マスタ駆動の汎用化）", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState())
      mockFindManyByIds.mockResolvedValue([
        buildFound(100, "abc"),
        buildFound(101, "def"),
      ])
      mockCreatePlaySession.mockResolvedValue({ id: 999 })
      /** 言語マスタが go を返す → toRewardLanguage が "go" を通す */
      mockLanguageRepository.findById.mockResolvedValue({ id: 1, name: "Go", slug: "go" })
      /** ベスト更新 + 上位 2 人 → newRank 3 (<= 10 で殿堂入り) */
      mockUpsertIfBest.mockResolvedValue({ updated: true })
      mockFindMineBest.mockResolvedValue({
        accuracy: 0.95,
        bestPlaySessionId: 999,
        playedAt: new Date(),
        score: 304,
        typedChars: 320,
      })
      mockCountHigherRanked.mockResolvedValue(2)
      /** 月間 TOP 10 路は対象外にする（cap 到達 + boundary がスコアより高い） */
      mockMonthlyCountByLanguage.mockResolvedValue(10)
      mockMonthlyFindBoundaryScore.mockResolvedValue(100_000)
      ;(mockRewardRepository.findByKey as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      ;(mockRewardRepository.upsertByKey as ReturnType<typeof vi.fn>).mockResolvedValue({
        assetSvgUrl: null,
        assetUrl: null,
        generationStatus: "pending",
        grantedAt: new Date(),
        id: 888,
        payload: { language: "go", rank: 3 },
        type: "hall_of_fame_in",
        userId: 42,
      })

      // Act
      const result = await finishSession(
        { accuracy: 0.95, keystrokeLogs: validLog, sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 320 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.newRank).toBe(3)
        expect(result.value.pendingRewards).toContainEqual({
          language: "go",
          rank: 3,
          rewardId: 888,
          type: "hall_of_fame_in",
        })
      }
      expect(mockEnqueue).toHaveBeenCalledWith(
        { rewardId: 888 },
        expect.objectContaining({ jobId: expect.any(String) }),
      )
    })

    it("isCorrect=false のキーストロークから正解期待文字単位で mistypeStats が集計される", async () => {
      // Arrange
      mockFindById.mockResolvedValue(buildState({ problemIds: [100] }))
      mockFindManyByIds.mockResolvedValue([buildFound(100, "hello")])
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
        buildFound(100, "abc"),
        buildFound(101, "def"),
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

    it("combo マイルストーン未達成で elapsed_ms が 120s + tolerance を超える log は 400 で reject される", async () => {
      // Arrange: combo 29 までしか積んでいないのに elapsed_ms = 130_000 の打鍵が紛れている
      mockFindById.mockResolvedValue(buildState({ problemIds: [100] }))
      mockFindManyByIds.mockResolvedValue([buildFound(100, "a".repeat(40))])

      const cheatLogs: KeystrokeLogs = [
        ...Array.from({ length: 29 }, (_, i) => ({
          elapsedMs: (i + 1) * 100,
          inputChar: "a",
          isCorrect: true,
          problemIndex: 0,
        })),
        /** combo 30 達成しないまま 130_000 ms の打鍵 → 許容上限 (120_000 + 500) を超過 */
        { elapsedMs: 130_000, inputChar: "a", isCorrect: true, problemIndex: 0 },
      ]

      // Act
      const result = await finishSession(
        { accuracy: 1, keystrokeLogs: cheatLogs, sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 30 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(mockTxRun).not.toHaveBeenCalled()
    })

    it("combo 30 達成済みなら 120_500 ms 程度の elapsed_ms は許容される (+1s 延長分が考慮される)", async () => {
      // Arrange: combo 30 達成 → 累積延長 +1s → 許容 121_500ms。 121_400 ms の打鍵は通る
      mockFindById.mockResolvedValue(buildState({ problemIds: [100] }))
      mockFindManyByIds.mockResolvedValue([buildFound(100, "a".repeat(40))])
      mockCreatePlaySession.mockResolvedValue({ id: 999 })

      const validBonusLogs: KeystrokeLogs = [
        ...Array.from({ length: 30 }, (_, i) => ({
          elapsedMs: (i + 1) * 100,
          inputChar: "a",
          isCorrect: true,
          problemIndex: 0,
        })),
        { elapsedMs: 121_400, inputChar: "a", isCorrect: true, problemIndex: 0 },
      ]

      // Act
      const result = await finishSession(
        { accuracy: 1, keystrokeLogs: validBonusLogs, sessionId: "550e8400-e29b-41d4-a716-446655440000", typedChars: 31 },
        buildRepoCollection(),
      )

      // Assert
      expect(result.ok).toBe(true)
    })
  })
})
