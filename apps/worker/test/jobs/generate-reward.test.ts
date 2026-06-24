import type { GenerateRewardJobData, JobMessage } from "@repo/queue"

import { generateReward, type GenerateRewardDeps } from "../../src/jobs/generate-reward"
import type { CardStorage } from "../../src/lib/card-storage"
import type {
  RewardRepository,
  RewardRow,
  UserRepository,
} from "../../src/repository/prisma"

/**
 * generate-image は satori + resvg でフォント読み込み + ラスタライズを行う重い処理なので
 * unit test では mock する（外部 / 重依存は mock する方針）。生成バイト列ではなく、worker の
 * ディスパッチ / ステート遷移 / 冪等性 / 異常系を検証する。
 */
vi.mock("@repo/generate-image", () => ({
  buildHofBadgeSvg: vi.fn(() => "<svg>hof</svg>"),
  buildMonthlyBadgeSvg: vi.fn(() => "<svg>monthly</svg>"),
  renderGradeUpCard: vi.fn(async () => Buffer.from("grade-png")),
  renderHallOfFameCard: vi.fn(async () => Buffer.from("hof-png")),
  renderMonthlyTopTenCard: vi.fn(async () => Buffer.from("monthly-png")),
}))

const buildMessage = (rewardId: number): JobMessage<GenerateRewardJobData> => ({
  attemptsMade: 0,
  data: { rewardId },
  id: `generate-reward-${rewardId}`,
})

const buildReward = (overrides: Partial<RewardRow>): RewardRow => ({
  assetSvgUrl: null,
  assetUrl: null,
  generationStatus: "pending",
  grantedAt: new Date("2026-06-01T00:00:00.000Z"),
  id: 1,
  payload: {},
  type: "grade_up",
  userId: 10,
  ...overrides,
})

const buildDeps = (reward: RewardRow | null) => {
  const rewardRepository: RewardRepository = {
    findById: vi.fn<(_0: number) => Promise<RewardRow | null>>(async () => reward),
    updateAssetsAndComplete: vi.fn(async () => undefined),
    updateGenerationStatus: vi.fn(async () => undefined),
  }
  const userRepository: UserRepository = {
    findPublicProfile: vi.fn(async () => ({ githubUsername: "octocat", id: 10 })),
  }
  const cardStorage: CardStorage = {
    save: vi.fn(async (filename: string) => `/cache/rewards/${filename}`),
  }
  const deps: GenerateRewardDeps = { cardStorage, rewardRepository, userRepository }
  return { cardStorage, deps, rewardRepository, userRepository }
}

describe("generateReward (worker job)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("grade_up reward を PNG 生成して completed に更新する（SVG は null）", async () => {
      const reward = buildReward({ id: 5, payload: { grade_slug: "senior" }, type: "grade_up", userId: 10 })
      const { cardStorage, deps, rewardRepository } = buildDeps(reward)

      await generateReward(deps)(buildMessage(5))

      expect(rewardRepository.updateGenerationStatus).toHaveBeenCalledWith(5, "processing")
      expect(cardStorage.save).toHaveBeenCalledWith("10-5.png", expect.any(Buffer))
      expect(rewardRepository.updateAssetsAndComplete).toHaveBeenCalledWith(5, {
        assetSvgUrl: null,
        assetUrl: "/cache/rewards/10-5.png",
      })
    })

    it("hall_of_fame_in reward を SVG + PNG 生成する", async () => {
      const reward = buildReward({
        id: 7,
        payload: { language: "typescript", rank: 1 },
        type: "hall_of_fame_in",
        userId: 20,
      })
      const { cardStorage, deps, rewardRepository } = buildDeps(reward)

      await generateReward(deps)(buildMessage(7))

      expect(cardStorage.save).toHaveBeenCalledWith("special-badges/20-hof-typescript.png", expect.any(Buffer))
      expect(rewardRepository.updateAssetsAndComplete).toHaveBeenCalledWith(7, {
        assetSvgUrl: "<svg>hof</svg>",
        assetUrl: "/cache/rewards/special-badges/20-hof-typescript.png",
      })
    })

    it("monthly_top_ten reward を SVG + PNG 生成する", async () => {
      const reward = buildReward({
        id: 9,
        payload: { language: "javascript", rank: 3, year_month: "2026-06" },
        type: "monthly_top_ten",
        userId: 30,
      })
      const { cardStorage, deps, rewardRepository } = buildDeps(reward)

      await generateReward(deps)(buildMessage(9))

      expect(cardStorage.save).toHaveBeenCalledWith(
        "special-badges/30-monthly-javascript-2026-06.png",
        expect.any(Buffer),
      )
      expect(rewardRepository.updateAssetsAndComplete).toHaveBeenCalledWith(9, {
        assetSvgUrl: "<svg>monthly</svg>",
        assetUrl: "/cache/rewards/special-badges/30-monthly-javascript-2026-06.png",
      })
    })

    it("既に completed かつ asset 済みなら no-op", async () => {
      const reward = buildReward({
        assetUrl: "/cache/rewards/10-1.png",
        generationStatus: "completed",
        payload: { grade_slug: "senior" },
      })
      const { cardStorage, deps, rewardRepository } = buildDeps(reward)

      await generateReward(deps)(buildMessage(1))

      expect(rewardRepository.updateGenerationStatus).not.toHaveBeenCalled()
      expect(cardStorage.save).not.toHaveBeenCalled()
      expect(rewardRepository.updateAssetsAndComplete).not.toHaveBeenCalled()
    })

    it("processing 中の reward でも再生成して上書きする（冪等）", async () => {
      const reward = buildReward({
        generationStatus: "processing",
        payload: { grade_slug: "mid" },
      })
      const { cardStorage, deps, rewardRepository } = buildDeps(reward)

      await generateReward(deps)(buildMessage(1))

      expect(cardStorage.save).toHaveBeenCalledTimes(1)
      expect(rewardRepository.updateAssetsAndComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe("異常系", () => {
    it("reward が存在しなければ early return（更新しない）", async () => {
      const { cardStorage, deps, rewardRepository } = buildDeps(null)

      await generateReward(deps)(buildMessage(404))

      expect(rewardRepository.updateGenerationStatus).not.toHaveBeenCalled()
      expect(cardStorage.save).not.toHaveBeenCalled()
      expect(rewardRepository.updateAssetsAndComplete).not.toHaveBeenCalled()
    })

    it("user が存在しなければ failed に更新して return する", async () => {
      const reward = buildReward({ payload: { grade_slug: "senior" } })
      const { cardStorage, deps, rewardRepository, userRepository } = buildDeps(reward)
      ;(userRepository.findPublicProfile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

      await generateReward(deps)(buildMessage(1))

      expect(rewardRepository.updateGenerationStatus).toHaveBeenCalledWith(1, "processing")
      expect(rewardRepository.updateGenerationStatus).toHaveBeenCalledWith(1, "failed")
      expect(cardStorage.save).not.toHaveBeenCalled()
      expect(rewardRepository.updateAssetsAndComplete).not.toHaveBeenCalled()
    })

    it("payload が不正（grade_slug 欠落）なら throw する（BullMQ がリトライ判定）", async () => {
      const reward = buildReward({ payload: {}, type: "grade_up" })
      const { deps } = buildDeps(reward)

      await expect(generateReward(deps)(buildMessage(1))).rejects.toThrow()
    })

    it("未知の type なら throw する", async () => {
      const reward = buildReward({ payload: {}, type: "unknown_type" })
      const { deps } = buildDeps(reward)

      await expect(generateReward(deps)(buildMessage(1))).rejects.toThrow()
    })
  })
})
