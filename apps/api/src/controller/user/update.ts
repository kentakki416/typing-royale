import { Response } from "express"

import { updateUserRequestSchema, updateUserResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * PATCH /api/user
 *
 * 認証中ユーザーの公開設定 / お気に入りリポジトリの部分更新。
 * 表示名は GitHub username 固定で編集不可。
 * リクエストボディは can_public_ranking / favorite_repo_url の少なくとも 1 つが必須。
 */
export class UserUpdateController {
  constructor(private userRepository: UserRepository) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("UserUpdateController: Updating authenticated user", { userId: req.userId })

    const body = parseRequest(updateUserRequestSchema, req.body)

    const result = await service.user.updateUser(
      req.userId!,
      {
        canPublicRanking: body.can_public_ranking,
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
      github_username: result.value.githubUsername,
      email: result.value.email,
      favorite_repo_url: result.value.favoriteRepoUrl,
      id: result.value.id,
    })

    return res.status(200).json(response)
  }
}
