import { logger } from "@repo/logger"

import { BadgeData, buildBadgeSvg, getPrivateBadgeSvg } from "../lib/badge-svg"
import { calcGrade } from "../lib/grade"
import {
  BadgeConfigRepository,
  BadgeConfigRow,
  LanguageRepository,
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../repository/prisma"

const DEFAULT_DISPLAY_ITEMS = ["grade", "best_score"]

type RenderRepo = {
    badgeConfigRepository: BadgeConfigRepository
    languageRepository: LanguageRepository
    userLanguageBestRepository: UserLanguageBestRepository
    userLifetimeStatsRepository: UserLifetimeStatsRepository
    userRepository: UserRepository
}

/**
 * GET /badge/:username.svg のレンダリング
 *
 * 1. username で user を取得（不在 or canPublicRanking=false なら private SVG）
 * 2. user_lifetime_stats / badge_configs を取得（無ければ defaults）
 * 3. displayItems に "rank" が含まれていれば TS の user_language_best から
 *    順位を算出（無ければ null）
 * 4. SVG 文字列を組み立てて返す (常に黒テーマ)
 *
 * 404 を返さず常に SVG を返す（CDN キャッシュ前提）
 */
export const render = async (
  input: { username: string },
  repo: RenderRepo,
): Promise<{ svg: string }> => {
  logger.debug("BadgeService: render", { username: input.username })

  const user = await repo.userRepository.findByDisplayName(input.username)
  if (user === null || !user.canPublicRanking) {
    return { svg: getPrivateBadgeSvg() }
  }

  const lifetime = await repo.userLifetimeStatsRepository.findByUserId(user.id)
  const config = (await repo.badgeConfigRepository.findByUserId(user.id))
    ?? { displayItems: DEFAULT_DISPLAY_ITEMS, updatedAt: new Date() }

  let rank: number | null = null
  if (config.displayItems.includes("rank")) {
    const ts = await repo.languageRepository.findBySlug("typescript")
    if (ts !== null) {
      const myBest = await repo.userLanguageBestRepository.findMine(user.id, ts.id)
      if (myBest !== null) {
        const higher = await repo.userLanguageBestRepository.countHigherRanked(ts.id, myBest)
        rank = higher + 1
      }
    }
  }

  const bestScore = lifetime?.bestScore ?? 0
  const grade = calcGrade(bestScore)
  const typedChars = Number(lifetime?.totalTypedChars ?? 0n)

  const data: BadgeData = {
    bestScore,
    grade: { name: grade.name, slug: grade.slug },
    rank,
    streakDays: lifetime?.streakDays ?? 0,
    typedChars,
    username: user.displayName,
  }

  const svg = buildBadgeSvg({
    data,
    displayItems: config.displayItems,
  })
  return { svg }
}

type ConfigRepo = {
    badgeConfigRepository: BadgeConfigRepository
}

/**
 * 自分のバッジ表示設定を取得（未保存なら defaults）
 */
export const getConfig = async (
  input: { userId: number },
  repo: ConfigRepo,
): Promise<BadgeConfigRow> => {
  const row = await repo.badgeConfigRepository.findByUserId(input.userId)
  return row ?? { displayItems: DEFAULT_DISPLAY_ITEMS, updatedAt: new Date(0) }
}

/**
 * 自分のバッジ表示設定を upsert
 */
export const upsertConfig = async (
  input: { userId: number; displayItems: string[] },
  repo: ConfigRepo,
): Promise<BadgeConfigRow> => {
  logger.debug("BadgeService: upsertConfig", { displayItems: input.displayItems, userId: input.userId })
  return repo.badgeConfigRepository.upsert(input.userId, {
    displayItems: input.displayItems,
  })
}
