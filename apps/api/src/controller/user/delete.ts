import { Response } from "express"

import { deleteUserResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
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
      return sendError(req, res, result.error)
    }

    return res.status(200).json(parseResponse(deleteUserResponseSchema, { message: "OK" }))
  }
}
