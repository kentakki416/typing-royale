import { Request, Response } from "express"

import {
  getPlayerPathParamSchema,
  getPlayerResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import {
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/players/:userId
 *
 * プレイヤー詳細データを返す。認証不要（公開プロフィール）
 * canPublicRanking=false は 404（プライバシー保護のため存在を識別させない）
 */
export class PlayerDetailController {
  constructor(
        private userLanguageBestRepository: UserLanguageBestRepository,
        private userLifetimeStatsRepository: UserLifetimeStatsRepository,
        private userRepository: UserRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const { userId } = parseRequest(getPlayerPathParamSchema, req.params)

    logger.info("PlayerDetailController: Fetching player", { userId })

    const result = await service.player.findById(
      { userId },
      {
        userLanguageBestRepository: this.userLanguageBestRepository,
        userLifetimeStatsRepository: this.userLifetimeStatsRepository,
        userRepository: this.userRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getPlayerResponseSchema, {
      language_bests: result.value.languageBests.map((b) => ({
        accuracy: b.accuracy,
        best_play_session_id: b.bestPlaySessionId,
        language: b.language,
        played_at: b.playedAt.toISOString(),
        rank: b.rank,
        score: b.score,
        typed_chars: b.typedChars,
      })),
      lifetime_stats: {
        best_score: result.value.lifetimeStats.bestScore,
        current_grade: {
          level: result.value.lifetimeStats.currentGrade.level,
          name: result.value.lifetimeStats.currentGrade.name,
          slug: result.value.lifetimeStats.currentGrade.slug,
        },
        current_grade_reached_at: result.value.lifetimeStats.currentGradeReachedAt?.toISOString() ?? null,
        streak_days: result.value.lifetimeStats.streakDays,
        total_sessions: result.value.lifetimeStats.totalSessions,
        total_typed_chars: result.value.lifetimeStats.totalTypedChars,
      },
      user: {
        id: result.value.user.id,
        avatar_url: result.value.user.avatarUrl,
        display_name: result.value.user.displayName,
        joined_at: result.value.user.joinedAt.toISOString(),
      },
    })
    return res.status(200).json(response)
  }
}
