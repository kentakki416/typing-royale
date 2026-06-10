import { Request, Response } from "express"

import { authGoogleRequestSchema, authGoogleResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { IGoogleOAuthClient } from "../../client/google-oauth"
import { generateAccessToken, generateRefreshToken } from "../../lib/jwt"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
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

    const { code, redirect_uri: redirectUri } = parseRequest(authGoogleRequestSchema, req.body)

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
      return sendError(req, res, result.error)
    }

    const { accessToken, isNewUser, refreshToken, user } = result.value

    const response = parseResponse(authGoogleResponseSchema, {
      access_token: accessToken,
      is_new_user: isNewUser,
      refresh_token: refreshToken,
      user: {
        avatar_url: user.avatarUrl,
        can_public_ranking: user.canPublicRanking,
        created_at: user.createdAt.toISOString(),
        display_name: user.displayName,
        email: user.email,
        id: user.id,
      },
    })

    return res.status(200).json(response)
  }
}
