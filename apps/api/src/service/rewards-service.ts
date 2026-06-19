import { badRequestError, err, forbiddenError, notFoundError, ok, Result } from "@repo/errors"
import {
  buildHofBadgeSvg,
  buildMonthlyBadgeSvg,
  renderGradeUpCard,
  renderHallOfFameCard,
  renderMonthlyTopTenCard,
} from "@repo/generate-image"
import { logger } from "@repo/logger"

import { CardStorage } from "../lib/card-storage"
import { calcGrade, GRADES } from "../lib/grade"
import {
  RewardRepository,
  RewardRow,
  SpecialBadgeKey,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../repository/prisma"
import type {
  HallOfFameInPayload,
  MonthlyTopTenPayload,
  RewardLanguage,
} from "../types/domain"

type CreateCardRepo = {
    cardStorage: CardStorage
    rewardRepository: RewardRepository
    userLifetimeStatsRepository: UserLifetimeStatsRepository
    userRepository: UserRepository
}

export type CreateCardInput = {
    userId: number
    type: "card" | "grade_up"
    payload: { grade_slug?: string; milestone_label?: string }
}

/**
 * 達成カード PNG の生成 (冪等 upsert)
 *
 * 1. 同 (userId, type, payload) の既存 reward があり assetUrl が立っていれば即返す
 * 2. 条件チェック (grade_up: bestScore >= 閾値、card: 未対応で 400)
 * 3. satori + resvg で PNG 生成
 * 4. CardStorage に保存して URL を取得
 * 5. rewards テーブルに upsert (assetUrl をセット)
 */
export const createCard = async (
  input: CreateCardInput,
  repo: CreateCardRepo,
): Promise<Result<RewardRow>> => {
  logger.debug("RewardsService: createCard", { type: input.type, userId: input.userId })

  const existing = await repo.rewardRepository.findOneByUserTypePayload(
    input.userId,
    input.type,
    input.payload,
  )
  if (existing !== null && existing.assetUrl !== null) {
    return ok(existing)
  }

  if (input.type !== "grade_up") {
    return err(badRequestError("Only grade_up cards are supported in MVP"))
  }

  const gradeSlug = input.payload.grade_slug
  if (typeof gradeSlug !== "string" || gradeSlug.length === 0) {
    return err(badRequestError("payload.grade_slug is required for grade_up"))
  }

  const targetGrade = GRADES.find((g) => g.slug === gradeSlug)
  if (targetGrade === undefined) {
    return err(badRequestError(`Unknown grade_slug: ${gradeSlug}`))
  }

  const lifetime = await repo.userLifetimeStatsRepository.findByUserId(input.userId)
  const bestScore = lifetime?.bestScore ?? 0
  if (bestScore < targetGrade.threshold) {
    return err(forbiddenError(`bestScore (${bestScore}) below ${targetGrade.name} threshold (${targetGrade.threshold})`))
  }

  /** 表示名 (なければ user{id} fallback) */
  const user = await repo.userRepository.findPublicProfile(input.userId)
  const githubUsername = user?.githubUsername ?? `user${input.userId}`

  /** 既存 reward 行が無ければまず空 assetUrl で行を確保 → file 保存 → URL 更新の 2 段階 */
  const placeholder = await repo.rewardRepository.upsert({
    assetUrl: null,
    payload: input.payload,
    type: input.type,
    userId: input.userId,
  })

  /**
   * PNG 生成は satori + resvg で数十〜数百 ms。生成失敗時は assetUrl が null のまま
   * 残るので、次回リクエストで再試行可能
   */
  const calculated = calcGrade(bestScore)
  const png = await renderGradeUpCard({
    achievedAt: placeholder.grantedAt,
    gradeName: targetGrade.name,
    gradeSlug: targetGrade.slug,
    userDisplayName: githubUsername,
  })
  void calculated

  const filename = `${input.userId}-${placeholder.id}.png`
  const url = await repo.cardStorage.save(filename, png)

  const updated = await repo.rewardRepository.upsert({
    assetUrl: url,
    grantedAt: placeholder.grantedAt,
    payload: input.payload,
    type: input.type,
    userId: input.userId,
  })

  return ok(updated)
}

type ListMineRepo = {
    rewardRepository: RewardRepository
}

/**
 * 自分の獲得済み rewards 一覧（最新順）。ids を指定すると id 絞り込み
 */
export const listMine = async (
  input: { userId: number; ids?: number[] },
  repo: ListMineRepo,
): Promise<RewardRow[]> => {
  if (input.ids !== undefined) {
    return repo.rewardRepository.findByIds(input.userId, input.ids)
  }
  return repo.rewardRepository.findByUserId(input.userId)
}

// ========================================================
// special-badges (殿堂入り / 月間 TOP 10) の冪等生成
// ========================================================

export type GenerateRewardInput =
    | { type: "hall_of_fame_in"; language: RewardLanguage; rank: number }
    | { type: "monthly_top_ten"; language: RewardLanguage; rank: number; yearMonth: string }

type GenerateRewardRepo = {
    cardStorage: CardStorage
    rewardRepository: RewardRepository
    userRepository: UserRepository
}

/**
 * 殿堂入り / 月間 TOP 10 入賞バッジの冪等生成。
 *
 * - 既存の reward 行があり assetUrl / assetSvgUrl が両方埋まっていて rank も
 *   同じなら、そのまま返す（冪等）
 * - rank が変わっていれば再生成して payload と asset を上書き
 * - pending 行（assetUrl=null or assetSvgUrl=null）があれば生成して埋める
 *
 * 詳細は docs/spec/special-badges/step2-api-rewards-generate.md 参照
 */
export const generateReward = async (
  userId: number,
  input: GenerateRewardInput,
  repo: GenerateRewardRepo,
): Promise<Result<RewardRow>> => {
  logger.debug("RewardsService: generateReward", { type: input.type, userId })

  const key = toBadgeKey(input)

  /** 既存行が完全に埋まっていて rank も同じなら冪等で即返す */
  const existing = await repo.rewardRepository.findByKey(userId, key)
  if (existing !== null && existing.assetUrl !== null && existing.assetSvgUrl !== null) {
    const existingRank = (existing.payload as { rank?: number }).rank
    if (existingRank === input.rank) {
      return ok(existing)
    }
    /** rank が変わっている → 再生成して上書き */
  }

  /** username を取得（ユーザー削除済みなら 404） */
  const user = await repo.userRepository.findPublicProfile(userId)
  if (user === null) {
    return err(notFoundError("User not found"))
  }
  const username = user.githubUsername ?? `user${userId}`

  /** SVG + PNG を生成 */
  const svg = input.type === "hall_of_fame_in"
    ? buildHofBadgeSvg({ language: input.language, rank: input.rank, username })
    : buildMonthlyBadgeSvg({
      language: input.language,
      rank: input.rank,
      username,
      yearMonth: input.yearMonth,
    })

  const png = input.type === "hall_of_fame_in"
    ? await renderHallOfFameCard({ language: input.language, rank: input.rank, username })
    : await renderMonthlyTopTenCard({
      language: input.language,
      rank: input.rank,
      username,
      yearMonth: input.yearMonth,
    })

  /** S3 / ローカルストレージに PNG を保存 */
  const filename = input.type === "hall_of_fame_in"
    ? `special-badges/${userId}-hof-${input.language}.png`
    : `special-badges/${userId}-monthly-${input.language}-${input.yearMonth}.png`
  const assetUrl = await repo.cardStorage.save(filename, png)

  const payload: HallOfFameInPayload | MonthlyTopTenPayload = input.type === "hall_of_fame_in"
    ? { language: input.language, rank: input.rank }
    : { language: input.language, rank: input.rank, year_month: input.yearMonth }

  const upserted = await repo.rewardRepository.upsertByKey(userId, key, {
    assetSvgUrl: svg,
    assetUrl,
    payload,
  })
  return ok(upserted)
}

type ReconcileRepo = GenerateRewardRepo

/**
 * 自分の pending な reward (assetUrl or assetSvgUrl が null) を全て再生成する。
 * /finish 完了時 + 次回ログイン時に呼ぶ自己修復ロジック。
 *
 * - special-badges 系のみ対象（grade_up は createCard で別途扱う）
 * - 1 件失敗しても他は続行する（次回再試行に任せる）
 */
export const reconcilePendingRewards = async (
  userId: number,
  repo: ReconcileRepo,
): Promise<void> => {
  const pendings = await repo.rewardRepository.findPendingByUserId(userId)
  if (pendings.length === 0) return

  logger.debug("RewardsService: reconcilePendingRewards", { count: pendings.length, userId })

  for (const p of pendings) {
    if (p.type !== "hall_of_fame_in" && p.type !== "monthly_top_ten") continue
    const input = toGenerateInputFromRow(p)
    if (input === null) continue
    try {
      await generateReward(userId, input, repo)
    } catch (e) {
      /** 1 件失敗しても他は続行（次回再試行で復旧） */
      logger.warn("RewardsService: reconcile generation failed", {
        error: e instanceof Error ? e.message : String(e),
        rewardId: p.id,
        userId,
      })
    }
  }
}

const toBadgeKey = (input: GenerateRewardInput): SpecialBadgeKey => {
  if (input.type === "hall_of_fame_in") {
    return { language: input.language, type: "hall_of_fame_in" }
  }
  return { language: input.language, type: "monthly_top_ten", yearMonth: input.yearMonth }
}

const toGenerateInputFromRow = (row: RewardRow): GenerateRewardInput | null => {
  const payload = row.payload as { language?: unknown; rank?: unknown; year_month?: unknown }
  const language = payload.language
  const rank = payload.rank
  if (language !== "typescript" && language !== "javascript") return null
  if (typeof rank !== "number") return null

  if (row.type === "hall_of_fame_in") {
    return { language, rank, type: "hall_of_fame_in" }
  }
  if (row.type === "monthly_top_ten") {
    const yearMonth = payload.year_month
    if (typeof yearMonth !== "string") return null
    return { language, rank, type: "monthly_top_ten", yearMonth }
  }
  return null
}
