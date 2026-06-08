import { Response } from "express"

import {
  ErrorResponse,
  hallOfFameCommentResponseSchema,
  submitHallOfFameCommentRequestSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { AuthRequest } from "../../middleware/auth"
import {
  HallOfFameEntryRepository,
  LanguageRepository,
  UserLanguageBestRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/hall-of-fame/comments
 *
 * 入賞者本人のコメント送信（upsert、即時公開）。認証必須
 */
export class HallOfFameCommentCreateController {
  constructor(
        private hallOfFameEntryRepository: HallOfFameEntryRepository,
        private languageRepository: LanguageRepository,
        private userLanguageBestRepository: UserLanguageBestRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { comment, language } = submitHallOfFameCommentRequestSchema.parse(req.body)

    logger.info("HallOfFameCommentCreateController: submitting", {
      language,
      userId: req.userId,
    })

    const result = await service.hallOfFame.submitComment(
      { comment, languageSlug: language, userId: req.userId! },
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

    const response = hallOfFameCommentResponseSchema.parse({
      comment: result.value.comment,
      comment_submitted_at: result.value.commentSubmittedAt.toISOString(),
      entry_id: result.value.entryId,
      language: result.value.languageSlug,
    })
    return res.status(200).json(response)
  }
}
