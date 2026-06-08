import { Response } from "express"

import { ErrorResponse, startChallengeGodsRequestSchema, startChallengeGodsResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { AuthRequest } from "../../middleware/auth"
import {
  KeystrokeLogRepository,
  LanguageRepository,
  PlaySessionRepository,
  ProblemRepository,
  RankingSnapshotRepository,
} from "../../repository/prisma"
import { PlaySessionStateRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * POST /api/play-sessions/challenge-gods
 *
 * 神々モードのプレイセッションを開始する。認証必須。
 * トップ 10 不在 / 全候補のキーストロークログ取得不能の場合は 409 Conflict を返す
 */
export class PlaySessionStartChallengeGodsController {
  constructor(
        private keystrokeLogRepository: KeystrokeLogRepository,
        private languageRepository: LanguageRepository,
        private playSessionRepository: PlaySessionRepository,
        private playSessionStateRepository: PlaySessionStateRepository,
        private problemRepository: ProblemRepository,
        private rankingSnapshotRepository: RankingSnapshotRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { language_id: languageId } = startChallengeGodsRequestSchema.parse(req.body)

    logger.info("PlaySessionStartChallengeGodsController: Starting challenge-gods session", {
      languageId,
      userId: req.userId,
    })

    const result = await service.playSession.createChallengeGodsSession(
      { languageId, userId: req.userId! },
      {
        keystrokeLogRepository: this.keystrokeLogRepository,
        languageRepository: this.languageRepository,
        playSessionRepository: this.playSessionRepository,
        playSessionStateRepository: this.playSessionStateRepository,
        problemRepository: this.problemRepository,
        rankingSnapshotRepository: this.rankingSnapshotRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = startChallengeGodsResponseSchema.parse({
      ghost_keystroke_logs: result.value.ghostKeystrokeLogs.map((entry) => ({
        elapsed_ms: entry.elapsedMs,
        input_char: entry.inputChar,
        is_correct: entry.isCorrect,
        problem_index: entry.problemIndex,
      })),
      ghost_session_id: result.value.ghostSessionId,
      ghost_user_display: {
        avatar_url: result.value.ghostUserDisplay.avatarUrl,
        best_score: result.value.ghostUserDisplay.bestScore,
        display_name: result.value.ghostUserDisplay.displayName,
        grade: result.value.ghostUserDisplay.grade,
      },
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
