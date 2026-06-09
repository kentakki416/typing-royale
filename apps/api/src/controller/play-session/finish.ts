import { Response } from "express"

import { ErrorResponse, finishPlaySessionPathParamSchema, finishPlaySessionRequestSchema, finishPlaySessionResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { CardStorage } from "../../lib/card-storage"
import { toGradeDto } from "../../lib/dto"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { AuthRequest } from "../../middleware/auth"
import {
  KeystrokeLogRepository,
  PlaySessionProblemRepository,
  PlaySessionRepository,
  ProblemRepository,
  RewardRepository,
  TransactionRunner,
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../../repository/prisma"
import { PlaySessionStateRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * POST /api/play-sessions/:id/finish
 *
 * 120 秒タイマー終了時にクライアントから集計値と keystroke log を受け取り、
 * サーバーで再集計して 5 テーブル（play_sessions / play_session_problems /
 * keystroke_logs / user_lifetime_stats / user_language_best）に atomic 書き込み +
 * Redis state 削除を行う。レスポンスには new_rank / top_ten_boundary_score /
 * grade_up / best_score_updated を含める（score-ranking step3）
 */
export class PlaySessionFinishController {
  constructor(
        private cardStorage: CardStorage,
        private keystrokeLogRepository: KeystrokeLogRepository,
        private playSessionProblemRepository: PlaySessionProblemRepository,
        private playSessionRepository: PlaySessionRepository,
        private playSessionStateRepository: PlaySessionStateRepository,
        private problemRepository: ProblemRepository,
        private rewardRepository: RewardRepository,
        private transactionRunner: TransactionRunner,
        private userLanguageBestRepository: UserLanguageBestRepository,
        private userLifetimeStatsRepository: UserLifetimeStatsRepository,
        private userRepository: UserRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = parseRequest(finishPlaySessionPathParamSchema, req.params)
    const { accuracy, keystroke_logs: rawKeystrokeLogs, typed_chars: typedChars } =
            parseRequest(finishPlaySessionRequestSchema, req.body)

    /**
     * API は snake_case、Domain 型は camelCase で分離する方針なので各 entry を変換
     */
    const keystrokeLogs = rawKeystrokeLogs.map((entry) => ({
      elapsedMs: entry.elapsed_ms,
      inputChar: entry.input_char,
      isCorrect: entry.is_correct,
      problemIndex: entry.problem_index,
    }))

    logger.info("PlaySessionFinishController: Finishing", {
      sessionId: id,
      userId: req.userId,
    })

    const result = await service.playSession.finishSession(
      { accuracy, keystrokeLogs, sessionId: id, typedChars },
      {
        cardStorage: this.cardStorage,
        keystrokeLogRepository: this.keystrokeLogRepository,
        playSessionProblemRepository: this.playSessionProblemRepository,
        playSessionRepository: this.playSessionRepository,
        playSessionStateRepository: this.playSessionStateRepository,
        problemRepository: this.problemRepository,
        rewardRepository: this.rewardRepository,
        transactionRunner: this.transactionRunner,
        userLanguageBestRepository: this.userLanguageBestRepository,
        userLifetimeStatsRepository: this.userLifetimeStatsRepository,
        userRepository: this.userRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = parseResponse(finishPlaySessionResponseSchema, {
      accuracy: result.value.accuracy,
      best_score_updated: result.value.bestScoreUpdated,
      grade_up: result.value.gradeUp === null
        ? null
        : {
          from: toGradeDto(result.value.gradeUp.from),
          to: toGradeDto(result.value.gradeUp.to),
        },
      mistype_stats: result.value.mistypeStats,
      new_rank: result.value.newRank,
      persisted: result.value.persisted,
      problems_completed: result.value.problemsCompleted,
      problems_played: result.value.problemsPlayed,
      score: result.value.score,
      top_ten_boundary_score: result.value.topTenBoundaryScore,
      typed_chars: result.value.typedChars,
    })
    return res.status(200).json(response)
  }
}
