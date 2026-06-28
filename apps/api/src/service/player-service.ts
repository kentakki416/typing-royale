import { err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { calcGrade, Grade } from "../lib/grade"
import {
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../repository/prisma"

type FindByIdRepo = {
    userLanguageBestRepository: UserLanguageBestRepository
    userLifetimeStatsRepository: UserLifetimeStatsRepository
    userRepository: UserRepository
}

export type FindByIdInput = {
    userId: number
}

export type FindByIdOutput = {
    languageBests: Array<{
        accuracy: number
        bestPlaySessionId: number
        language: { id: number; name: string; slug: string }
        playedAt: Date
        rank: number
        score: number
        typedChars: number
    }>
    lifetimeStats: {
        bestScore: number
        currentGrade: Grade
        currentGradeReachedAt: Date | null
        streakDays: number
        totalSessions: number
        totalTypedChars: number
    }
    user: {
        avatarUrl: string | null
        favoriteRepoUrl: string | null
        githubUsername: string
        id: number
        joinedAt: Date
    }
}

/**
 * プレイヤー詳細データの取得
 *
 * 1. user を取得（存在しないか canPublicRanking=false なら 404）
 * 2. user_lifetime_stats を取得（無ければデフォルト値で構成）
 * 3. user_language_best を Language JOIN で全件取得 + 各言語ベストの rank を都度算出
 * 4. グレードは全言語通算 bestScore で calcGrade を呼ぶ
 *
 * canPublicRanking=false を 404 にする理由はプライバシー保護
 * （非公開ユーザーの存在を識別させない）
 */
export const findById = async (
  input: FindByIdInput,
  repo: FindByIdRepo,
): Promise<Result<FindByIdOutput>> => {
  logger.debug("PlayerService: findById", { userId: input.userId })

  const user = await repo.userRepository.findPublicProfile(input.userId)
  if (user === null || !user.canPublicRanking) {
    return err(notFoundError("Player not found"))
  }

  const lifetime = await repo.userLifetimeStatsRepository.findByUserId(input.userId)
  const bestScore = lifetime?.bestScore ?? 0
  const grade = calcGrade(bestScore)

  const bests = await repo.userLanguageBestRepository.findAllByUserId(input.userId)
  const bestsWithRank = await Promise.all(
    bests.map(async (b) => {
      const higher = await repo.userLanguageBestRepository.countHigherRanked(b.languageId, {
        accuracy: b.accuracy,
        bestPlaySessionId: b.bestPlaySessionId,
        playedAt: b.playedAt,
        score: b.score,
        typedChars: b.typedChars,
      })
      return {
        accuracy: b.accuracy,
        bestPlaySessionId: b.bestPlaySessionId,
        language: b.language,
        playedAt: b.playedAt,
        rank: higher + 1,
        score: b.score,
        typedChars: b.typedChars,
      }
    }),
  )

  return ok({
    languageBests: bestsWithRank,
    lifetimeStats: {
      bestScore,
      currentGrade: grade,
      currentGradeReachedAt: lifetime?.currentGradeReachedAt ?? null,
      streakDays: lifetime?.streakDays ?? 0,
      totalSessions: lifetime?.totalSessions ?? 0,
      totalTypedChars: Number(lifetime?.totalTypedChars ?? 0n),
    },
    user: {
      avatarUrl: user.avatarUrl,
      favoriteRepoUrl: user.favoriteRepoUrl,
      githubUsername: user.githubUsername,
      id: user.id,
      joinedAt: user.createdAt,
    },
  })
}
