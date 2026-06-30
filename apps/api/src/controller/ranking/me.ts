import { Response } from "express"

import {
  getMyRankingQueryStringSchema,
  getMyRankingResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import {
  LanguageRepository,
  PlaySessionRepository,
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
        private playSessionRepository: PlaySessionRepository,
        private userLanguageBestRepository: UserLanguageBestRepository,
        private userLifetimeStatsRepository: UserLifetimeStatsRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const query = parseRequest(getMyRankingQueryStringSchema, req.query)

    logger.info("RankingMeController: Fetching my ranking", {
      language: query.language,
      userId: req.userId,
    })

    const result = await service.ranking.findMine(
      { languageSlug: query.language, userId: req.userId! },
      {
        languageRepository: this.languageRepository,
        playSessionRepository: this.playSessionRepository,
        userLanguageBestRepository: this.userLanguageBestRepository,
        userLifetimeStatsRepository: this.userLifetimeStatsRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getMyRankingResponseSchema, {
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
      play_count: result.value.playCount,
      rank: result.value.rank,
      total_ranked_players: result.value.totalRankedPlayers,
    })
    return res.status(200).json(response)
  }
}
