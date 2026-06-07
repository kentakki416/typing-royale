import { Request, Response } from "express"

import {
  ErrorResponse,
  getRankingsQueryStringSchema,
  getRankingsResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import {
  LanguageRepository,
  UserLanguageBestRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/rankings
 *
 * 言語別 TOP N を返す。認証不要（公開）
 */
export class RankingListController {
  constructor(
        private languageRepository: LanguageRepository,
        private userLanguageBestRepository: UserLanguageBestRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const query = getRankingsQueryStringSchema.parse(req.query)

    logger.info("RankingListController: Listing rankings", {
      language: query.language,
      limit: query.limit,
    })

    const result = await service.ranking.list(
      { languageSlug: query.language, limit: query.limit },
      {
        languageRepository: this.languageRepository,
        userLanguageBestRepository: this.userLanguageBestRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getRankingsResponseSchema.parse({
      entries: result.value.entries.map((e) => ({
        accuracy: e.accuracy,
        best_play_session_id: e.bestPlaySessionId,
        played_at: e.playedAt.toISOString(),
        rank: e.rank,
        score: e.score,
        typed_chars: e.typedChars,
        user: {
          id: e.user.id,
          avatar_url: e.user.avatarUrl,
          current_grade: e.user.currentGrade,
          display_name: e.user.displayName,
        },
      })),
      language: result.value.language,
      total_ranked_players: result.value.totalRankedPlayers,
    })
    return res.status(200).json(response)
  }
}
