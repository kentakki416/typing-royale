import { Response } from "express"

import { ErrorResponse, finishPlaySessionPathParamSchema, finishPlaySessionRequestSchema, finishPlaySessionResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { AuthRequest } from "../../middleware/auth"
import {
  KeystrokeLogRepository,
  PlaySessionProblemRepository,
  PlaySessionRepository,
  ProblemRepository,
  TransactionRunner,
  UserLifetimeStatsRepository,
} from "../../repository/prisma"
import { PlaySessionStateRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * POST /api/play-sessions/:id/finish
 *
 * 120 秒タイマー終了時にクライアントから集計値と keystroke log を受け取り、
 * サーバーで再集計して 4 テーブル（play_sessions / play_session_problems /
 * keystroke_logs / user_lifetime_stats）に atomic 書き込み + Redis state 削除を行う
 */
export class PlaySessionFinishController {
  constructor(
        private keystrokeLogRepository: KeystrokeLogRepository,
        private playSessionProblemRepository: PlaySessionProblemRepository,
        private playSessionRepository: PlaySessionRepository,
        private playSessionStateRepository: PlaySessionStateRepository,
        private problemRepository: ProblemRepository,
        private transactionRunner: TransactionRunner,
        private userLifetimeStatsRepository: UserLifetimeStatsRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = finishPlaySessionPathParamSchema.parse(req.params)
    const { accuracy, keystroke_log: keystrokeLog, typed_chars: typedChars } =
            finishPlaySessionRequestSchema.parse(req.body)

    logger.info("PlaySessionFinishController: Finishing", {
      sessionId: id,
      userId: req.userId,
    })

    const result = await service.playSession.finishSession(
      { accuracy, keystrokeLog, sessionId: id, typedChars },
      {
        keystrokeLogRepository: this.keystrokeLogRepository,
        playSessionProblemRepository: this.playSessionProblemRepository,
        playSessionRepository: this.playSessionRepository,
        playSessionStateRepository: this.playSessionStateRepository,
        problemRepository: this.problemRepository,
        transactionRunner: this.transactionRunner,
        userLifetimeStatsRepository: this.userLifetimeStatsRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = finishPlaySessionResponseSchema.parse({
      accuracy: result.value.accuracy,
      mistype_stats: result.value.mistypeStats,
      persisted: result.value.persisted,
      problems_completed: result.value.problemsCompleted,
      problems_played: result.value.problemsPlayed,
      score: result.value.score,
      typed_chars: result.value.typedChars,
    })
    return res.status(200).json(response)
  }
}
