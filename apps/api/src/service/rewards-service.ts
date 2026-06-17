import { badRequestError, err, forbiddenError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { renderGradeUpCard } from "../lib/card-renderer"
import { CardStorage } from "../lib/card-storage"
import { calcGrade, GRADES } from "../lib/grade"
import {
  RewardRepository,
  RewardRow,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../repository/prisma"

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
 * 自分の獲得済み rewards 一覧（最新順）
 */
export const listMine = async (
  input: { userId: number },
  repo: ListMineRepo,
): Promise<RewardRow[]> => {
  return repo.rewardRepository.findByUserId(input.userId)
}
