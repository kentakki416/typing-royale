import { Request, Response } from "express"

import { startGuestChallengeGodsRequestSchema, startGuestChallengeGodsResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import {
  KeystrokeLogRepository,
  LanguageRepository,
  PlaySessionRepository,
  ProblemRepository,
  RankingSnapshotRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/play-sessions/guest/challenge-gods
 *
 * ゲスト用の神々モードセッション開始（ステートレス）。
 * 認証不要・Redis 不使用。トップ 10 不在 / 全候補のキーストロークログ取得不能の
 * 場合は 409 Conflict を返す。`/finish` 時に必要な problem_ids はクライアントが保持。
 */
export class PlaySessionGuestStartChallengeGodsController {
  constructor(
        private keystrokeLogRepository: KeystrokeLogRepository,
        private languageRepository: LanguageRepository,
        private playSessionRepository: PlaySessionRepository,
        private problemRepository: ProblemRepository,
        private rankingSnapshotRepository: RankingSnapshotRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const { language_id: languageId } = parseRequest(startGuestChallengeGodsRequestSchema, req.body)

    logger.info("PlaySessionGuestStartChallengeGodsController: Starting guest challenge-gods session", { languageId })

    const result = await service.playSession.createGuestChallengeGodsSession(
      { languageId },
      {
        keystrokeLogRepository: this.keystrokeLogRepository,
        languageRepository: this.languageRepository,
        playSessionRepository: this.playSessionRepository,
        problemRepository: this.problemRepository,
        rankingSnapshotRepository: this.rankingSnapshotRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(startGuestChallengeGodsResponseSchema, {
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
        github_username: result.value.ghostUserDisplay.githubUsername,
        grade: result.value.ghostUserDisplay.grade,
        played_at: result.value.ghostUserDisplay.playedAt.toISOString(),
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
    })
    return res.status(200).json(response)
  }
}
