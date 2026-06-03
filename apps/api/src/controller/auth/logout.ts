import { Request, Response } from "express"

import { authLogoutRequestSchema, authLogoutResponseSchema, ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { verifyRefreshToken } from "../../lib/jwt"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * Refresh Token を無効化してログアウトする API
 * 冪等性のため、無効なトークンでも 200 を返す
 */
export class AuthLogoutController {
  constructor(private refreshTokenRepository: RefreshTokenRepository) {}

  async execute(req: Request, res: Response) {
    logger.info("AuthLogoutController: Logging out")

    const { refresh_token: refreshToken } = authLogoutRequestSchema.parse(req.body)

    const result = await service.auth.logout(
      { refreshToken },
      { refreshTokenRepository: this.refreshTokenRepository },
      (token) => {
        const payload = verifyRefreshToken(token)
        return payload ? { jti: payload.jti, userId: payload.userId } : null
      }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    return res.status(200).json(authLogoutResponseSchema.parse({ message: "OK" }))
  }
}
