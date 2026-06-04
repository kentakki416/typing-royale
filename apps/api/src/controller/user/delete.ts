import { Response } from "express"

import { deleteUserResponseSchema, ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository/prisma"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * DELETE /api/user
 *
 * 認証中ユーザーのアカウントを GDPR 即時削除する。User の FK Cascade で
 * AuthAccount / スコア・特典関連の子テーブルが連動削除され、Redis 上の
 * Refresh Token も deleteAllByUserId で失効する。
 */
export class UserDeleteController {
  constructor(
    private userRepository: UserRepository,
    private refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("UserDeleteController: Deleting authenticated user account", { userId: req.userId })

    const result = await service.user.deleteAccount(req.userId!, {
      refreshTokenRepository: this.refreshTokenRepository,
      userRepository: this.userRepository,
    })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    return res.status(200).json(deleteUserResponseSchema.parse({ message: "OK" }))
  }
}
