import { Request, Response } from "express"

import { getReplayPathParamSchema, getReplayResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { KeystrokeLogRepository, ReplayRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/replays/:playSessionId
 *
 * 指定セッションのリプレイデータ（出題シーケンス + キーストロークログ + 出典）を返す
 * 認証不要。canPublicRanking=false / keystroke 欠落時は 404
 */
export class ReplayGetController {
  constructor(
        private keystrokeLogRepository: KeystrokeLogRepository,
        private replayRepository: ReplayRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const { playSessionId } = parseRequest(getReplayPathParamSchema, req.params)

    logger.info("ReplayGetController: Getting replay", { playSessionId })

    const result = await service.replay.getReplay(
      { playSessionId },
      {
        keystrokeLogRepository: this.keystrokeLogRepository,
        replayRepository: this.replayRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { keystrokeLogs, source } = result.value
    const response = parseResponse(getReplayResponseSchema, {
      keystroke_logs: keystrokeLogs.map((entry) => ({
        elapsed_ms: entry.elapsedMs,
        input_char: entry.inputChar,
        is_correct: entry.isCorrect,
        problem_index: entry.problemIndex,
      })),
      language: source.language.slug,
      play_session_id: source.id,
      player: {
        avatar_url: source.user.avatarUrl,
        current_grade: source.user.currentGrade ?? "intern",
        display_name: source.user.displayName ?? `user${source.user.id}`,
        user_id: source.user.id,
      },
      problems: source.problems.map((p) => ({
        char_count: p.problem.charCount,
        code_block: p.problem.codeBlock,
        function_name: p.problem.functionName,
        id: p.problem.id,
        line_count: p.problem.lineCount,
        order_index: p.orderIndex,
        source_url: p.problem.sourceUrl,
      })),
      repo_info: {
        description: source.crawledRepo.description,
        homepage: source.crawledRepo.homepage,
        license: source.crawledRepo.license,
        name: source.crawledRepo.name,
        owner: source.crawledRepo.owner,
        stars: source.crawledRepo.stars,
        /**
         * topics は jsonb 由来。string[] であることはクローラ側で保証
         */
        topics: Array.isArray(source.crawledRepo.topics)
          ? (source.crawledRepo.topics as string[])
          : [],
      },
      stats: {
        accuracy: source.accuracy,
        played_at: source.playedAt.toISOString(),
        problems_completed: source.problemsCompleted,
        score: source.score,
        typed_chars: source.typedChars,
      },
    })
    return res.status(200).json(response)
  }
}
