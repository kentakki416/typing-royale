import { Response } from "express"

import { getUserResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { requireAuth } from "../../lib/require-auth"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/user
 *
 * 認証中ユーザー自身の情報を返す。req.userId は authMiddleware が確定済みの前提。
 */
export class UserGetController {
  constructor(private userRepository: UserRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const userId = requireAuth(req, res)
    if (userId === null) return

    logger.info("UserGetController: Fetching authenticated user", {
      requestedUserId: userId,
    })

    const result = await service.user.getUserById(userId, { userRepository: this.userRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getUserResponseSchema, {
      avatar_url: result.value.avatarUrl,
      can_public_ranking: result.value.canPublicRanking,
      created_at: result.value.createdAt.toISOString(),
      display_name: result.value.displayName,
      email: result.value.email,
      favorite_repo_url: result.value.favoriteRepoUrl,
      id: result.value.id,
    })

    return res.status(200).json(response)
  }
}
