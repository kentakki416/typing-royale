import { Request, Response } from "express"

import { finishGuestPlaySessionRequestSchema, finishGuestPlaySessionResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { ProblemRepository, UserLanguageBestRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/play-sessions/guest/finish
 *
 * ゲスト用の /finish（ステートレス）。
 * 認証不要・Redis 不使用・DB 書き込みなし。サーバー側でスコアを再集計するだけ。
 * クライアントは problem_ids を /guest/solo (or /guest/challenge-gods) のレスポンスから
 * そのまま転送する。
 */
export class PlaySessionGuestFinishController {
  constructor(
        private problemRepository: ProblemRepository,
        private userLanguageBestRepository: UserLanguageBestRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const {
      accuracy,
      keystroke_logs: rawKeystrokeLogs,
      problem_ids: problemIds,
      typed_chars: typedChars,
    } = parseRequest(finishGuestPlaySessionRequestSchema, req.body)

    const keystrokeLogs = rawKeystrokeLogs.map((entry) => ({
      elapsedMs: entry.elapsed_ms,
      inputChar: entry.input_char,
      isCorrect: entry.is_correct,
      problemIndex: entry.problem_index,
    }))

    logger.info("PlaySessionGuestFinishController: Finishing guest session")

    const result = await service.playSession.finishGuestSession(
      { accuracy, keystrokeLogs, problemIds, typedChars },
      {
        problemRepository: this.problemRepository,
        userLanguageBestRepository: this.userLanguageBestRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(finishGuestPlaySessionResponseSchema, {
      accuracy: result.value.accuracy,
      mistype_stats: result.value.mistypeStats,
      new_rank: result.value.newRank,
      problems_completed: result.value.problemsCompleted,
      problems_played: result.value.problemsPlayed,
      score: result.value.score,
      total_ranked_players: result.value.totalRankedPlayers,
      typed_chars: result.value.typedChars,
    })
    return res.status(200).json(response)
  }
}
