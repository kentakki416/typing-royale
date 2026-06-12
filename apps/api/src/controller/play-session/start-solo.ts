import { Response } from "express"

import { startSoloPlaySessionRequestSchema, startSoloPlaySessionResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { requireAuth } from "../../lib/require-auth"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import {
  CrawledRepoRepository,
  LanguageRepository,
  ProblemRepository,
} from "../../repository/prisma"
import { PlaySessionStateRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * POST /api/play-sessions/solo
 *
 * 通常モードのプレイセッションを開始する。認証必須（req.userId は authMiddleware が確定済みの前提）
 */
export class PlaySessionStartSoloController {
  constructor(
        private crawledRepoRepository: CrawledRepoRepository,
        private languageRepository: LanguageRepository,
        private playSessionStateRepository: PlaySessionStateRepository,
        private problemRepository: ProblemRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const userId = requireAuth(req, res)
    if (userId === null) return

    const { language_id: languageId } = parseRequest(startSoloPlaySessionRequestSchema, req.body)

    logger.info("PlaySessionStartSoloController: Starting solo session", {
      languageId,
      userId,
    })

    const result = await service.playSession.createSoloSession(
      { languageId, userId },
      {
        crawledRepoRepository: this.crawledRepoRepository,
        languageRepository: this.languageRepository,
        playSessionStateRepository: this.playSessionStateRepository,
        problemRepository: this.problemRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(startSoloPlaySessionResponseSchema, {
      problems: result.value.problems.map((p) => ({
        char_count: p.charCount,
        code_block: p.codeBlock,
        function_name: p.functionName,
        id: p.id,
        line_count: p.lineCount,
        order_index: p.orderIndex,
        source_url: p.sourceUrl,
      })),
      repo_info: result.value.repoInfo,
      session_id: result.value.sessionId,
    })
    return res.status(200).json(response)
  }
}
