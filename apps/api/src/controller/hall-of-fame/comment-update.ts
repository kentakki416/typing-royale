import { Response } from "express"

import {
  hallOfFameCommentResponseSchema,
  updateHallOfFameCommentPathParamSchema,
  updateHallOfFameCommentRequestSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { requireAuth } from "../../lib/require-auth"
import { sendError } from "../../lib/send-error"
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
    const userId = requireAuth(req, res)
    if (userId === null) return

    const { entryId } = parseRequest(updateHallOfFameCommentPathParamSchema, req.params)
    const { comment } = parseRequest(updateHallOfFameCommentRequestSchema, req.body)

    logger.info("HallOfFameCommentUpdateController: updating", {
      entryId,
      userId,
    })

    const result = await service.hallOfFame.updateComment(
      { comment, entryId, userId },
      {
        hallOfFameEntryRepository: this.hallOfFameEntryRepository,
        languageRepository: this.languageRepository,
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
