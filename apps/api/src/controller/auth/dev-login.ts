import { Request, Response } from "express"

import {
  authDevLoginRequestSchema,
  authDevLoginResponseSchema,
  ErrorResponse,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { generateAccessToken, generateRefreshToken } from "../../lib/jwt"
import { UserRepository } from "../../repository/prisma"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * 開発環境専用ログイン API
 *
 * seed で投入済みの dev ユーザー（例: alice@dev.local）の email を受け取り
 * Google OAuth と同じ形の Access/Refresh Token を発行する。
 *
 * 多重ガード:
 * 1. index.ts で本番時はインスタンス化しない
 * 2. auth-router.ts で controller 未指定ならルート登録しない
 * 3. ここでも NODE_ENV を見て 404 を返す
 */
export class AuthDevLoginController {
  constructor(
    private userRepository: UserRepository,
    private refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(req: Request, res: Response) {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not Found", status_code: 404 })
    }

    logger.info("AuthDevLoginController: dev-login")

    const { email } = authDevLoginRequestSchema.parse(req.body)

    const result = await service.auth.loginAsDevUser(
      { email },
      {
        refreshTokenRepository: this.refreshTokenRepository,
        userRepository: this.userRepository,
      },
      { generateAccessToken, generateRefreshToken },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const { accessToken, refreshToken, user } = result.value

    const response = authDevLoginResponseSchema.parse({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        avatar_url: user.avatarUrl,
        created_at: user.createdAt.toISOString(),
        display_name: user.displayName,
        email: user.email,
        id: user.id,
        public_ranking: user.publicRanking,
      },
    })

    return res.status(200).json(response)
  }
}
