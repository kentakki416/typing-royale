import { Request, Response } from "express"

import { startGuestSoloPlaySessionRequestSchema, startGuestSoloPlaySessionResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import {
  CrawledRepoRepository,
  LanguageRepository,
  ProblemRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/play-sessions/guest/solo
 *
 * ゲスト用の通常モードセッション開始（ステートレス）。
 * 認証不要・Redis 不使用。サーバーは問題抽選結果をそのまま返すだけ。
 * `/finish` 時に必要な problem_ids はクライアントが保持する想定。
 */
export class PlaySessionGuestStartSoloController {
  constructor(
        private crawledRepoRepository: CrawledRepoRepository,
        private languageRepository: LanguageRepository,
        private problemRepository: ProblemRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const { language_id: languageId } = parseRequest(startGuestSoloPlaySessionRequestSchema, req.body)

    logger.info("PlaySessionGuestStartSoloController: Starting guest solo session", { languageId })

    const result = await service.playSession.createGuestSoloSession(
      { languageId },
      {
        crawledRepoRepository: this.crawledRepoRepository,
        languageRepository: this.languageRepository,
        problemRepository: this.problemRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(startGuestSoloPlaySessionResponseSchema, {
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
    })
    return res.status(200).json(response)
  }
}
