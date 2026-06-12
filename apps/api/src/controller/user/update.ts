import { Response } from "express"

import { updateUserRequestSchema, updateUserResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { requireAuth } from "../../lib/require-auth"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * PATCH /api/user
 *
 * 認証中ユーザーの表示名 / ランキング公開設定の部分更新。
 * リクエストボディは display_name / can_public_ranking の少なくとも 1 つが必須。
 */
export class UserUpdateController {
  constructor(private userRepository: UserRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const userId = requireAuth(req, res)
    if (userId === null) return

    logger.info("UserUpdateController: Updating authenticated user", { userId })

    const body = parseRequest(updateUserRequestSchema, req.body)

    const result = await service.user.updateUser(
      userId,
      {
        canPublicRanking: body.can_public_ranking,
        displayName: body.display_name,
        favoriteRepoUrl: body.favorite_repo_url,
      },
      { userRepository: this.userRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateUserResponseSchema, {
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
