import { Request, Response } from "express"

import { authGithubRequestSchema, authGithubResponseSchema, ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { IGithubOAuthClient } from "../../client/github-oauth"
import { generateAccessToken, generateRefreshToken } from "../../lib/jwt"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import {
  AuthAccountRepository,
  TransactionRunner,
  UserRepository,
} from "../../repository/prisma"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * GitHub OAuth 認証コードを検証し、Access/Refresh Token を発行する API
 *
 * Web (Next.js) 側で state 照合を済ませた後、code を受け取って
 * GitHub と通信 → User+AuthAccount upsert → JWT 発行までを担当する。
 */
export class AuthGithubController {
  constructor(
    private authAccountRepository: AuthAccountRepository,
    private userRepository: UserRepository,
    private refreshTokenRepository: RefreshTokenRepository,
    private transactionRunner: TransactionRunner,
    private githubOAuthClient: IGithubOAuthClient
  ) {}

  async execute(req: Request, res: Response) {
    logger.info("AuthGithubController: Verifying GitHub authorization code")

    const { code, redirect_uri: redirectUri } = parseRequest(authGithubRequestSchema, req.body)

    const result = await service.auth.authenticateWithGithub(
      { code, redirectUri },
      {
        authAccountRepository: this.authAccountRepository,
        refreshTokenRepository: this.refreshTokenRepository,
        transactionRunner: this.transactionRunner,
        userRepository: this.userRepository,
      },
      this.githubOAuthClient,
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

    const response = parseResponse(authGithubResponseSchema, {
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
