import { badRequestError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { calcGrade, calcNextGrade, Grade } from "../lib/grade"
import {
  LanguageRepository,
  MonthlyRankingSnapshotRepository,
  MonthlyRankingTopEntry,
  PlaySessionRepository,
  UserLanguageBestRepository,
  UserLanguageBestWithUser,
  UserLifetimeStatsRepository,
} from "../repository/prisma"

type ListRepo = {
    languageRepository: LanguageRepository
    userLanguageBestRepository: UserLanguageBestRepository
}

export type ListInput = {
    languageSlug: string
    limit: number
}

export type ListOutput = {
    entries: Array<UserLanguageBestWithUser & { rank: number }>
    language: string
    totalRankedPlayers: number
}

/**
 * 言語別 TOP N のリアルタイム集計
 *
 * 1. language slug → id 解決（無ければ 404）
 * 2. user_language_best を tie-break 込みで ORDER BY → 先頭から rank 1..N で採番
 * 3. 言語別ランカー総数を COUNT で取得
 */
export const list = async (
  input: ListInput,
  repo: ListRepo,
): Promise<Result<ListOutput>> => {
  logger.debug("RankingService: list", { language: input.languageSlug, limit: input.limit })

  const language = await repo.languageRepository.findBySlug(input.languageSlug)
  if (!language) return err(notFoundError("Language not found"))

  const top = await repo.userLanguageBestRepository.findTopByLanguage(
    language.id,
    input.limit,
  )
  const totalRankedPlayers = await repo.userLanguageBestRepository.countRankableByLanguage(
    language.id,
  )

  return ok({
    entries: top.map((entry, idx) => ({ ...entry, rank: idx + 1 })),
    language: input.languageSlug,
    totalRankedPlayers,
  })
}

type FindMineRepo = {
    languageRepository: LanguageRepository
    playSessionRepository: PlaySessionRepository
    userLanguageBestRepository: UserLanguageBestRepository
    userLifetimeStatsRepository: UserLifetimeStatsRepository
}

export type FindMineInput = {
    languageSlug: string
    userId: number
}

export type FindMineOutput = {
    bestAccuracy: number | null
    bestPlaySessionId: number | null
    bestPlayedAt: Date | null
    bestScore: number | null
    grade: Grade
    language: string
    nextGrade: (Grade & { scoreNeeded: number }) | null
    playCount: number
    rank: number | null
    totalRankedPlayers: number
}

/**
 * 認証ユーザーの言語別順位 + グレード進捗のリアルタイム集計
 *
 * 1. language slug → id 解決（無ければ 404）
 * 2. 自分のベストを引く（無ければ rank=null / best_*=null）
 * 3. user_lifetime_stats から全言語通算 bestScore を引いてグレード判定
 *    （`canPublicRanking=false` でも自分の順位は返す）
 * 4. ベストありなら自分より上位の数を COUNT → +1 で rank
 */
export const findMine = async (
  input: FindMineInput,
  repo: FindMineRepo,
): Promise<Result<FindMineOutput>> => {
  logger.debug("RankingService: findMine", { language: input.languageSlug, userId: input.userId })

  const language = await repo.languageRepository.findBySlug(input.languageSlug)
  if (!language) return err(notFoundError("Language not found"))

  const myBest = await repo.userLanguageBestRepository.findMine(input.userId, language.id)
  const lifetimeStats = await repo.userLifetimeStatsRepository.findByUserId(input.userId)
  const lifetimeBestScore = lifetimeStats?.bestScore ?? 0

  const grade = calcGrade(lifetimeBestScore)
  const next = calcNextGrade(grade)
  const nextGrade = next === null
    ? null
    : { ...next, scoreNeeded: Math.max(0, next.threshold - lifetimeBestScore) }

  const totalRankedPlayers = await repo.userLanguageBestRepository.countRankableByLanguage(
    language.id,
  )

  /** この言語の累計プレイ回数（play_sessions の件数）。ベストの有無に関わらず数える */
  const playCount = await repo.playSessionRepository.countByUserAndLanguage(
    input.userId,
    language.id,
  )

  if (myBest === null) {
    return ok({
      bestAccuracy: null,
      bestPlaySessionId: null,
      bestPlayedAt: null,
      bestScore: null,
      grade,
      language: input.languageSlug,
      nextGrade,
      playCount,
      rank: null,
      totalRankedPlayers,
    })
  }

  const higher = await repo.userLanguageBestRepository.countHigherRanked(language.id, myBest)
  return ok({
    bestAccuracy: myBest.accuracy,
    bestPlaySessionId: myBest.bestPlaySessionId,
    bestPlayedAt: myBest.playedAt,
    bestScore: myBest.score,
    grade,
    language: input.languageSlug,
    nextGrade,
    playCount,
    rank: higher + 1,
    totalRankedPlayers,
  })
}

// ========================================================
// GET /api/rankings/monthly - 当月の言語別 TOP N
// ========================================================

type ListMonthlyRepo = {
    languageRepository: LanguageRepository
    monthlyRankingSnapshotRepository: MonthlyRankingSnapshotRepository
}

export type ListMonthlyInput = {
    languageSlug: string
    limit: number
}

export type MonthlyRankingEntryWithRank = MonthlyRankingTopEntry & { rank: number }

export type ListMonthlyOutput = {
    entries: MonthlyRankingEntryWithRank[]
    yearMonth: string
}

/**
 * 当月の言語別 TOP N を返す。
 *
 * v2 では `/finish` 内 transaction で `monthly_ranking_snapshots` が直接 UPSERT される。
 * Repository は `ORDER BY score DESC, accuracy DESC, played_at ASC` で取り出すだけで、
 * 順位 (`rank`) はここで `idx + 1` を振る (殿堂入りと同じ設計)
 */
export const listMonthly = async (
  input: ListMonthlyInput,
  repo: ListMonthlyRepo,
): Promise<Result<ListMonthlyOutput>> => {
  logger.debug("RankingService: listMonthly", { language: input.languageSlug, limit: input.limit })

  const language = await repo.languageRepository.findBySlug(input.languageSlug)
  if (!language) return err(badRequestError(`Unsupported language: ${input.languageSlug}`))

  const yearMonth = currentYearMonthJst(new Date())
  const top = await repo.monthlyRankingSnapshotRepository.findTopByLanguage(
    yearMonth,
    language.id,
    input.limit,
  )
  const entries = top.map((entry, idx) => ({ ...entry, rank: idx + 1 }))

  return ok({ entries, yearMonth })
}

/**
 * 与えられた時刻が属する JST 暦月を "YYYY-MM" 形式で返す純関数
 */
const currentYearMonthJst = (now: Date): string => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}`
}
