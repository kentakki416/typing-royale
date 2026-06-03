import { Response } from "express"

import { authMeResponseSchema, ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * 現在ログイン中のユーザー情報を取得するAPI
 */
export class AuthMeController {
  constructor(private userRepository: UserRepository) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("AuthMeController: Fetching user information", {
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

    logger.info("AuthMeController: User information retrieved successfully", {
      userId: result.value.id,
    })

    // レスポンススキーマのバリデーション
    const response = authMeResponseSchema.parse({
      avatar_url: result.value.avatarUrl,
      created_at: result.value.createdAt.toISOString(),
      display_name: result.value.displayName,
      email: result.value.email,
      id: result.value.id,
      public_ranking: result.value.publicRanking,
    })

    return res.status(200).json(response)
  }
}
