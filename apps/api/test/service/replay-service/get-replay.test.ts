import { KeystrokeLogRepository, ReplayRepository, ReplaySource } from "../../../src/repository/prisma"
import { getReplay } from "../../../src/service/replay-service"
import type { KeystrokeLogs } from "../../../src/types/domain"

const buildSource = (overrides: Partial<ReplaySource> = {}): ReplaySource => ({
  accuracy: 0.95,
  crawledRepo: {
    description: "demo",
    homepage: null,
    license: "MIT",
    name: "demo-repo",
    owner: "demo",
    stars: 100,
    topics: ["demo"],
  },
  id: 42,
  language: { slug: "typescript" },
  playedAt: new Date("2026-06-08T00:00:00Z"),
  problems: [
    {
      orderIndex: 0,
      problem: {
        charCount: 30,
        codeBlock: "function f() {}",
        functionName: "f",
        id: 1,
        lineCount: 1,
        sourceUrl: "https://example.com/f.ts",
      },
    },
  ],
  problemsCompleted: 1,
  score: 1200,
  typedChars: 1250,
  user: {
    avatarUrl: null,
    canPublicRanking: true,
    currentGrade: "senior",
    githubUsername: "Alice",
    id: 1,
  },
  ...overrides,
})

const mockFindById = vi.fn<(_0: number) => Promise<ReplaySource | null>>()
const mockFindByPlaySessionId = vi.fn<(_0: number) => Promise<KeystrokeLogs | null>>()

const mockReplayRepository: ReplayRepository = {
  findById: mockFindById,
}

const mockKeystrokeLogRepository: KeystrokeLogRepository = {
  create: vi.fn(),
  findByPlaySessionId: mockFindByPlaySessionId,
}

describe("replay.getReplay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("source と keystrokeLogs を含めて ok を返す", async () => {
      const source = buildSource()
      const logs: KeystrokeLogs = [
        { elapsedMs: 1000, inputChar: "a", isCorrect: true, problemIndex: 0 },
      ]
      mockFindById.mockResolvedValue(source)
      mockFindByPlaySessionId.mockResolvedValue(logs)

      const result = await getReplay(
        { playSessionId: 42 },
        { keystrokeLogRepository: mockKeystrokeLogRepository, replayRepository: mockReplayRepository },
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ keystrokeLogs: logs, source })
      }
      expect(mockFindById).toHaveBeenCalledWith(42)
      expect(mockFindByPlaySessionId).toHaveBeenCalledWith(42)
    })
  })

  describe("異常系", () => {
    it("PlaySession 不在で 404 を返す", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await getReplay(
        { playSessionId: 42 },
        { keystrokeLogRepository: mockKeystrokeLogRepository, replayRepository: mockReplayRepository },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(mockFindByPlaySessionId).not.toHaveBeenCalled()
    })

    it("プレイヤーが canPublicRanking=false で 404 を返す", async () => {
      mockFindById.mockResolvedValue(buildSource({
        user: {
          avatarUrl: null,
          canPublicRanking: false,
          currentGrade: "senior",
          githubUsername: "Alice",
          id: 1,
        },
      }))

      const result = await getReplay(
        { playSessionId: 42 },
        { keystrokeLogRepository: mockKeystrokeLogRepository, replayRepository: mockReplayRepository },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
      }
      expect(mockFindByPlaySessionId).not.toHaveBeenCalled()
    })

    it("keystroke_logs 欠落で 404 を返す", async () => {
      mockFindById.mockResolvedValue(buildSource())
      mockFindByPlaySessionId.mockResolvedValue(null)

      const result = await getReplay(
        { playSessionId: 42 },
        { keystrokeLogRepository: mockKeystrokeLogRepository, replayRepository: mockReplayRepository },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
      }
    })
  })
})
