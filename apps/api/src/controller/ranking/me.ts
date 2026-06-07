import { Response } from "express"

import {
  ErrorResponse,
  getMyRankingQueryStringSchema,
  getMyRankingResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { AuthRequest } from "../../middleware/auth"
import {
  LanguageRepository,
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/rankings/me
 *
 * 認証ユーザーの言語別順位 + グレード進捗を返す。認証必須
 */
export class RankingMeController {
  constructor(
        private languageRepository: LanguageRepository,
        private userLanguageBestRepository: UserLanguageBestRepository,
        private userLifetimeStatsRepository: UserLifetimeStatsRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const query = getMyRankingQueryStringSchema.parse(req.query)

    logger.info("RankingMeController: Fetching my ranking", {
      language: query.language,
      userId: req.userId,
    })

    const result = await service.ranking.findMine(
      { languageSlug: query.language, userId: req.userId! },
      {
        languageRepository: this.languageRepository,
        userLanguageBestRepository: this.userLanguageBestRepository,
        userLifetimeStatsRepository: this.userLifetimeStatsRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getMyRankingResponseSchema.parse({
      best_accuracy: result.value.bestAccuracy,
      best_play_session_id: result.value.bestPlaySessionId,
      best_played_at: result.value.bestPlayedAt?.toISOString() ?? null,
      best_score: result.value.bestScore,
      grade: {
        level: result.value.grade.level,
        name: result.value.grade.name,
        slug: result.value.grade.slug,
      },
      language: result.value.language,
      next_grade: result.value.nextGrade === null
        ? null
        : {
          level: result.value.nextGrade.level,
          name: result.value.nextGrade.name,
          score_needed: result.value.nextGrade.scoreNeeded,
          slug: result.value.nextGrade.slug,
        },
      rank: result.value.rank,
      total_ranked_players: result.value.totalRankedPlayers,
    })
    return res.status(200).json(response)
  }
}
