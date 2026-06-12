import { Response } from "express"

import {
  hallOfFameCommentResponseSchema,
  submitHallOfFameCommentRequestSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { requireAuth } from "../../lib/require-auth"
import { sendError } from "../../lib/send-error"
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
    const userId = requireAuth(req, res)
    if (userId === null) return

    const { comment, language } = parseRequest(submitHallOfFameCommentRequestSchema, req.body)

    logger.info("HallOfFameCommentCreateController: submitting", {
      language,
      userId,
    })

    const result = await service.hallOfFame.submitComment(
      { comment, languageSlug: language, userId },
      {
        hallOfFameEntryRepository: this.hallOfFameEntryRepository,
        languageRepository: this.languageRepository,
        userLanguageBestRepository: this.userLanguageBestRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(hallOfFameCommentResponseSchema, {
      comment: result.value.comment,
      comment_submitted_at: result.value.commentSubmittedAt.toISOString(),
      entry_id: result.value.entryId,
      language: result.value.languageSlug,
    })
    return res.status(200).json(response)
  }
}
