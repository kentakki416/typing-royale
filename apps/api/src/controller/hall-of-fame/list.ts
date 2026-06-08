import { Request, Response } from "express"

import {
  ErrorResponse,
  getHallOfFameQueryStringSchema,
  getHallOfFameResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import {
  HallOfFameEntryRepository,
  LanguageRepository,
  UserLanguageBestRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/hall-of-fame
 *
 * 言語別 TOP 10 + コメントを返す。認証不要（公開）
 */
export class HallOfFameListController {
  constructor(
        private hallOfFameEntryRepository: HallOfFameEntryRepository,
        private languageRepository: LanguageRepository,
        private userLanguageBestRepository: UserLanguageBestRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const query = getHallOfFameQueryStringSchema.parse(req.query)

    logger.info("HallOfFameListController: listing", { language: query.language })

    const result = await service.hallOfFame.list(
      { languageSlug: query.language },
      {
        hallOfFameEntryRepository: this.hallOfFameEntryRepository,
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

    const response = getHallOfFameResponseSchema.parse({
      entries: result.value.entries.map((e) => ({
        accuracy: e.accuracy,
        best_play_session_id: e.bestPlaySessionId,
        comment: e.comment,
        comment_submitted_at: e.commentSubmittedAt?.toISOString() ?? null,
        entry_id: e.entryId,
        played_at: e.playedAt.toISOString(),
        rank: e.rank,
        score: e.score,
        typed_chars: e.typedChars,
        user: {
          id: e.user.id,
          avatar_url: e.user.avatarUrl,
          current_grade: e.user.currentGrade,
          display_name: e.user.displayName,
          favorite_repo_url: e.user.favoriteRepoUrl,
        },
      })),
      language: result.value.language,
    })
    return res.status(200).json(response)
  }
}
