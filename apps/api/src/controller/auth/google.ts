import { Request, Response } from "express"

import { authGoogleRequestSchema, authGoogleResponseSchema, ErrorResponse } from "@repo/api-schema"

import { IGoogleOAuthClient } from "../../client/google-oauth"
import { generateAccessToken, generateRefreshToken } from "../../lib/jwt"
import { logger } from "../../log"
import {
  AuthAccountRepository,
  TransactionRunner,
  UserRepository,
} from "../../repository/prisma"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * Google OAuth 認証コードを検証し、Access/Refresh Token を発行する API
 */
export class AuthGoogleController {
  constructor(
    private authAccountRepository: AuthAccountRepository,
    private userRepository: UserRepository,
    private refreshTokenRepository: RefreshTokenRepository,
    private transactionRunner: TransactionRunner,
    private googleOAuthClient: IGoogleOAuthClient
  ) {}

  async execute(req: Request, res: Response) {
    logger.info("AuthGoogleController: Verifying Google authorization code")

    const { code, redirect_uri: redirectUri } = authGoogleRequestSchema.parse(req.body)

    const result = await service.auth.authenticateWithGoogle(
      { code, redirectUri },
      {
        authAccountRepository: this.authAccountRepository,
        refreshTokenRepository: this.refreshTokenRepository,
        transactionRunner: this.transactionRunner,
        userRepository: this.userRepository,
      },
      this.googleOAuthClient,
      { generateAccessToken, generateRefreshToken }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const { accessToken, isNewUser, refreshToken, user } = result.value

    const response = authGoogleResponseSchema.parse({
      access_token: accessToken,
      is_new_user: isNewUser,
      refresh_token: refreshToken,
      user: {
        avatar_url: user.avatarUrl,
        created_at: user.createdAt.toISOString(),
        email: user.email,
        id: user.id,
        name: user.name,
      },
    })

    return res.status(200).json(response)
  }
}
