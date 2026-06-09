import { Response } from "express"

import {
  ErrorResponse,
  hallOfFameCommentResponseSchema,
  updateHallOfFameCommentPathParamSchema,
  updateHallOfFameCommentRequestSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { AuthRequest } from "../../middleware/auth"
import {
  HallOfFameEntryRepository,
  LanguageRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * PATCH /api/hall-of-fame/comments/:entryId
 *
 * 自分のコメントを編集。認証必須、他人の entry は 403
 */
export class HallOfFameCommentUpdateController {
  constructor(
        private hallOfFameEntryRepository: HallOfFameEntryRepository,
        private languageRepository: LanguageRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { entryId } = parseRequest(updateHallOfFameCommentPathParamSchema, req.params)
    const { comment } = parseRequest(updateHallOfFameCommentRequestSchema, req.body)

    logger.info("HallOfFameCommentUpdateController: updating", {
      entryId,
      userId: req.userId,
    })

    const result = await service.hallOfFame.updateComment(
      { comment, entryId, userId: req.userId! },
      {
        hallOfFameEntryRepository: this.hallOfFameEntryRepository,
        languageRepository: this.languageRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
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
