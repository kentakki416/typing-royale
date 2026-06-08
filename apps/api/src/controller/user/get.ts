import { Response } from "express"

import { getUserResponseSchema, ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

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
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getUserResponseSchema.parse({
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
