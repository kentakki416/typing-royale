import { Request, Response } from "express"

import { authRefreshRequestSchema, authRefreshResponseSchema, ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * Refresh Token をローテーションして新しい Access/Refresh Token を発行する API
 */
export class AuthRefreshController {
  constructor(private refreshTokenRepository: RefreshTokenRepository) {}

  async execute(req: Request, res: Response) {
    logger.info("AuthRefreshController: Rotating refresh token")

    const { refresh_token: refreshToken } = authRefreshRequestSchema.parse(req.body)

    const result = await service.auth.refreshTokens(
      { refreshToken },
      { refreshTokenRepository: this.refreshTokenRepository },
      (token) => {
        const payload = verifyRefreshToken(token)
        return payload ? { jti: payload.jti, userId: payload.userId } : null
      },
      { generateAccessToken, generateRefreshToken }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = authRefreshResponseSchema.parse({
      access_token: result.value.accessToken,
      refresh_token: result.value.refreshToken,
    })

    return res.status(200).json(response)
  }
}
