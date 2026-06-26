import { Response } from "express"

import { getUserResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserLifetimeStatsRepository, UserRepository } from "../../repository/prisma"
import * as service from "../../service"
import { MistypeStats } from "../../types/domain"

/**
 * マイページに出す苦手文字の件数（誤打数の多い順）
 */
const WEAK_CHARS_LIMIT = 5

/**
 * 生涯通算の文字ごと誤打数を「苦手文字 top N（誤打数降順）」に整形する
 */
const toWeakChars = (stats: MistypeStats): { char: string; count: number }[] =>
  Object.entries(stats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, WEAK_CHARS_LIMIT)
    .map(([char, count]) => ({ char, count }))

/**
 * GET /api/user
 *
 * 認証中ユーザー自身の情報 + マイページ用の苦手文字（生涯累計 top N）を返す。
 * req.userId は authMiddleware が確定済みの前提。
 */
export class UserGetController {
  constructor(
    private userRepository: UserRepository,
    private userLifetimeStatsRepository: UserLifetimeStatsRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("UserGetController: Fetching authenticated user", {
      requestedUserId: req.userId,
    })

    const [result, lifetime] = await Promise.all([
      service.user.getUserById(req.userId!, { userRepository: this.userRepository }),
      this.userLifetimeStatsRepository.findByUserId(req.userId!),
    ])

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getUserResponseSchema, {
      avatar_url: result.value.avatarUrl,
      can_public_ranking: result.value.canPublicRanking,
      created_at: result.value.createdAt.toISOString(),
      github_username: result.value.githubUsername,
      email: result.value.email,
      favorite_repo_url: result.value.favoriteRepoUrl,
      id: result.value.id,
      weak_chars: toWeakChars(lifetime?.lifetimeMistypeStats ?? {}),
    })

    return res.status(200).json(response)
  }
}
