import { Request, Response } from "express"

import {
  getHallOfFameQueryStringSchema,
  getHallOfFameResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import {
  LanguageRepository,
  UserLanguageBestRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/hall-of-fame
 *
 * 言語別 TOP 10 を返す。認証不要（公開）
 */
export class HallOfFameListController {
  constructor(
        private languageRepository: LanguageRepository,
        private userLanguageBestRepository: UserLanguageBestRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const query = parseRequest(getHallOfFameQueryStringSchema, req.query)

    logger.info("HallOfFameListController: listing", { language: query.language })

    const result = await service.hallOfFame.list(
      { languageSlug: query.language },
      {
        languageRepository: this.languageRepository,
        userLanguageBestRepository: this.userLanguageBestRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getHallOfFameResponseSchema, {
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
          github_username: e.user.githubUsername,
          favorite_repo_url: e.user.favoriteRepoUrl,
        },
      })),
      language: result.value.language,
    })
    return res.status(200).json(response)
  }
}
