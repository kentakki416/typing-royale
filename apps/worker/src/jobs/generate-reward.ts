import {
  buildHofBadgeSvg,
  buildMonthlyBadgeSvg,
  renderGradeUpCard,
  renderHallOfFameCard,
  renderMonthlyTopTenCard,
  type RewardLanguage,
} from "@repo/generate-image"
import { logger } from "@repo/logger"
import type { GenerateRewardJobData, JobProcessor } from "@repo/queue"
import type { Storage } from "@repo/storage"

import type { RewardRepository, RewardRow, UserRepository } from "../repository/prisma"

export type GenerateRewardDeps = {
    cardStorage: Storage
    rewardRepository: RewardRepository
    userRepository: UserRepository
}

/**
 * grade_up カード用のグレード slug → 表示名。apps/api/src/lib/grade.ts の GRADES を
 * 表示名だけ複製している（generate-image が RewardLanguage を複製しているのと同じ方針で、
 * worker は apps/api の domain に依存させない）。未知の slug は slug をそのまま表示。
 */
const GRADE_NAMES: Record<string, string> = {
  distinguished: "Distinguished Engineer",
  fellow: "Fellow",
  intern: "Intern",
  junior: "Junior Developer",
  mid: "Mid Developer",
  principal: "Principal Engineer",
  senior: "Senior Engineer",
  staff: "Staff Engineer",
}

/**
 * `generate-reward` ジョブハンドラ。reward の SVG / PNG を非同期生成する。冪等。
 *
 * 1. rewards から該当行を取得（無ければ early return）
 * 2. generation_status="completed" かつ assetUrl 済みなら no-op
 * 3. generation_status="processing" に遷移
 * 4. user の公開プロフィール取得（消えていれば failed にして return）
 * 5. type に応じて SVG + PNG を生成
 * 6. PNG を storage に save
 * 7. asset_url / asset_svg_url / generation_status="completed" を保存
 * 8. 失敗時は throw（BullMQ がリトライ判定、3 回失敗で onFinalFailure → failed）
 *
 * **重要**: BullMQ / ioredis の型は import しない。`JobProcessor<T>` 経由でしか Queue を
 * knows しないので、別の Queue 実装に乗り換えてもこのファイルは無変更で済む。
 *
 * 詳細: docs/spec/rewards-worker/step3-apps-worker-and-finish-refactor.md
 */
export const generateReward = (
  deps: GenerateRewardDeps,
): JobProcessor<GenerateRewardJobData> =>
  async (message) => {
    const { rewardId } = message.data

    const reward = await deps.rewardRepository.findById(rewardId)
    if (reward === null) {
      logger.warn("generateReward: reward not found, skipping", { jobId: message.id, rewardId })
      return
    }
    if (reward.generationStatus === "completed" && reward.assetUrl !== null) {
      return
    }

    await deps.rewardRepository.updateGenerationStatus(rewardId, "processing")

    const user = await deps.userRepository.findPublicProfile(reward.userId)
    if (user === null) {
      /** ユーザーが消えているのは異常だが、リトライしても回復しないので failed で打ち切る */
      logger.warn("generateReward: user gone, marking failed", { jobId: message.id, rewardId })
      await deps.rewardRepository.updateGenerationStatus(rewardId, "failed")
      return
    }
    const username = user.githubUsername ?? `user${user.id}`

    const { png, svg } = await renderForType(reward, username)

    const filename = buildFilename(reward)
    const assetUrl = await deps.cardStorage.save(filename, png)

    await deps.rewardRepository.updateAssetsAndComplete(rewardId, {
      assetSvgUrl: svg,
      assetUrl,
    })

    logger.info("generateReward: completed", {
      jobId: message.id,
      rewardId,
      type: reward.type,
    })
  }

/** type に応じて SVG + PNG を生成する。grade_up は SVG バッジを持たないので svg=null */
const renderForType = async (
  reward: RewardRow,
  username: string,
): Promise<{ png: Buffer; svg: string | null }> => {
  if (reward.type === "grade_up") {
    const gradeSlug = readString(reward.payload.grade_slug)
    if (gradeSlug === null) {
      throw new Error(`generateReward: grade_up reward ${reward.id} has no grade_slug`)
    }
    const png = await renderGradeUpCard({
      achievedAt: reward.grantedAt,
      gradeName: GRADE_NAMES[gradeSlug] ?? gradeSlug,
      gradeSlug,
      userDisplayName: username,
    })
    return { png, svg: null }
  }

  if (reward.type === "hall_of_fame_in") {
    const { language, rank } = readSpecialBadgePayload(reward)
    const svg = buildHofBadgeSvg({ language, rank, username })
    const png = await renderHallOfFameCard({ language, rank, username })
    return { png, svg }
  }

  if (reward.type === "monthly_top_ten") {
    const { language, rank } = readSpecialBadgePayload(reward)
    const yearMonth = readString(reward.payload.year_month)
    if (yearMonth === null) {
      throw new Error(`generateReward: monthly_top_ten reward ${reward.id} has no year_month`)
    }
    const svg = buildMonthlyBadgeSvg({ language, rank, username, yearMonth })
    const png = await renderMonthlyTopTenCard({ language, rank, username, yearMonth })
    return { png, svg }
  }

  throw new Error(`generateReward: unknown reward type "${reward.type}" (id=${reward.id})`)
}

/** type 別の保存 filename。apps/api の旧 createCard / generateReward と同じ命名を維持する */
const buildFilename = (reward: RewardRow): string => {
  if (reward.type === "grade_up") {
    return `${reward.userId}-${reward.id}.png`
  }
  const language = readString(reward.payload.language) ?? "unknown"
  if (reward.type === "hall_of_fame_in") {
    return `special-badges/${reward.userId}-hof-${language}.png`
  }
  const yearMonth = readString(reward.payload.year_month) ?? "unknown"
  return `special-badges/${reward.userId}-monthly-${language}-${yearMonth}.png`
}

const readSpecialBadgePayload = (
  reward: RewardRow,
): { language: RewardLanguage; rank: number } => {
  const language = readString(reward.payload.language)
  const rank = readNumber(reward.payload.rank)
  if (language !== "javascript" && language !== "typescript") {
    throw new Error(`generateReward: reward ${reward.id} has invalid language "${String(language)}"`)
  }
  if (rank === null) {
    throw new Error(`generateReward: reward ${reward.id} has invalid rank`)
  }
  return { language, rank }
}

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null
