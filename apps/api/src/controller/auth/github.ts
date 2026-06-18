import { Request, Response } from "express"

import { authGithubRequestSchema, authGithubResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { IGithubOAuthClient } from "../../client/github-oauth"
import { CardStorage } from "../../lib/card-storage"
import { generateAccessToken, generateRefreshToken } from "../../lib/jwt"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import {
  AuthAccountRepository,
  RewardRepository,
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
    private rewardRepository: RewardRepository,
    private transactionRunner: TransactionRunner,
    private githubOAuthClient: IGithubOAuthClient,
    private cardStorage: CardStorage,
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
      return sendError(req, res, result.error)
    }

    const { accessToken, isNewUser, refreshToken, user } = result.value

    /**
     * special-badges (step2): ログイン直後に未生成 (pending) reward の自己修復を
     * バックグラウンドで実行する。失敗してもレスポンスには影響させない (catch して warn)
     */
    void service.rewards.reconcilePendingRewards(user.id, {
      cardStorage: this.cardStorage,
      rewardRepository: this.rewardRepository,
      userRepository: this.userRepository,
    }).catch((e) => {
      logger.warn("AuthGithubController: reconcilePendingRewards failed", {
        error: e instanceof Error ? e.message : String(e),
        userId: user.id,
      })
    })

    const response = parseResponse(authGithubResponseSchema, {
      access_token: accessToken,
      is_new_user: isNewUser,
      refresh_token: refreshToken,
      user: {
        avatar_url: user.avatarUrl,
        can_public_ranking: user.canPublicRanking,
        created_at: user.createdAt.toISOString(),
        github_username: user.githubUsername,
        email: user.email,
        id: user.id,
      },
    })

    return res.status(200).json(response)
  }
}
