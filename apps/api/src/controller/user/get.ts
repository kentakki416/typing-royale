import { Response } from "express"

import { getUserResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
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
    logger.info("UserGetController: Fetching authenticated user", {
      requestedUserId: req.userId,
    })

    const result = await service.user.getUserById(req.userId!, { userRepository: this.userRepository })

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
    })

    return res.status(200).json(response)
  }
}
