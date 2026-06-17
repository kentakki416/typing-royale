import { err, notFoundError, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import { GithubUserInfo, type IGithubOAuthClient } from "../client/github-oauth"
import {
  AuthAccountRepository,
  TransactionRunner,
  UserRepository,
} from "../repository/prisma"
import { RefreshTokenRepository } from "../repository/redis"
import { User } from "../types/domain"

export type AuthenticateWithProviderSuccess = {
    accessToken: string
    isNewUser: boolean
    refreshToken: string
    user: User
}

export type AuthenticateWithGithubSuccess = AuthenticateWithProviderSuccess

type Repositories = {
    authAccountRepository: AuthAccountRepository
    refreshTokenRepository: RefreshTokenRepository
    transactionRunner: TransactionRunner
    userRepository: UserRepository
}

type TokenGenerators = {
    generateAccessToken: (userId: number) => string
    generateRefreshToken: (userId: number) => { jti: string; token: string }
}

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7

/**
 * GitHub アカウントでの認証
 *
 * Web (Next.js) 側で取得した Authorization Code を GitHub で検証し、UserInfo を取得する。
 * 既存ユーザーが居なければ User + AuthAccount(provider="github") を作成し、Access/Refresh Token を発行する。
 *
 * GitHub OAuth は `user:email` スコープを要求しないため email は保存しない。
 * 表示名は GitHub の name が無い場合は login（GitHub username）を採用する。
 */
export const authenticateWithGithub = async (
  input: { code: string; redirectUri: string },
  repo: Repositories,
  githubOAuthClient: IGithubOAuthClient,
  tokenGenerators: TokenGenerators
): Promise<Result<AuthenticateWithProviderSuccess>> => {
  logger.info("AuthService: Starting GitHub authentication")

  const githubUser: GithubUserInfo = await githubOAuthClient.getUserInfo(input.code, input.redirectUri)
  logger.debug("AuthService: Retrieved GitHub user info", {
    githubId: githubUser.id,
    login: githubUser.login,
  })

  const existingAccount = await repo.authAccountRepository.findByProvider("github", githubUser.id)

  let user: User
  let isNewUser = false

  if (existingAccount) {
    logger.info("AuthService: Existing user found", { userId: existingAccount.user.id })
    user = existingAccount.user
  } else {
    isNewUser = true
    logger.info("AuthService: Creating new user")
    /**
     * githubUsername は GitHub login (= username) を常に保存する。 本名 (githubUser.name)
     * は使わない (表示名はあくまで GitHub username で固定)。
     * email は MVP では収集しないため未保存（spec: github-auth/README.md「メールアドレス収集方針」）。
     */
    user = await repo.transactionRunner.run(async (tx) => {
      const newUser = await repo.userRepository.create(
        {
          avatarUrl: githubUser.avatarUrl ?? undefined,
          githubUsername: githubUser.login,
        },
        tx,
      )
      await repo.authAccountRepository.create(
        {
          provider: "github",
          providerAccountId: githubUser.id,
          userId: newUser.id,
        },
        tx,
      )
      return newUser
    })
    logger.info("AuthService: New user created", { userId: user.id })
  }

  const accessToken = tokenGenerators.generateAccessToken(user.id)
  const { jti, token: refreshToken } = tokenGenerators.generateRefreshToken(user.id)
  await repo.refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

  logger.debug("AuthService: Tokens issued", { userId: user.id })

  return ok({
    accessToken,
    isNewUser,
    refreshToken,
    user,
  })
}

export type LoginAsDevUserSuccess = {
    accessToken: string
    refreshToken: string
    user: User
}

/**
 * 開発環境専用ログイン
 *
 * email で seed 済みの dev ユーザーを引き当てて Access/Refresh Token を発行する。
 * production での誤実行を防ぐためのガードは呼び出し側（controller / index.ts / PUBLIC_PATHS）で行う。
 * このサービス関数自体は環境非依存。
 */
export const loginAsDevUser = async (
  input: { email: string },
  repo: {
    refreshTokenRepository: RefreshTokenRepository
    userRepository: UserRepository
  },
  tokenGenerators: TokenGenerators
): Promise<Result<LoginAsDevUserSuccess>> => {
  logger.info("AuthService: dev-login attempt", { email: input.email })

  const user = await repo.userRepository.findByEmail(input.email)
  if (!user) {
    return err(notFoundError("Dev user not found"))
  }

  const accessToken = tokenGenerators.generateAccessToken(user.id)
  const { jti, token: refreshToken } = tokenGenerators.generateRefreshToken(user.id)
  await repo.refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

  logger.info("AuthService: dev-login success", { userId: user.id })

  return ok({ accessToken, refreshToken, user })
}

export type RefreshTokensSuccess = {
    accessToken: string
    refreshToken: string
}

type RefreshVerifier = (token: string) => { jti: string; userId: number } | null

/**
 * Refresh Token のローテーション
 *
 * 受け取った Refresh Token を検証し、Redis 上の jti と一致する場合は旧 jti を破棄して
 * 新しい Access Token + Refresh Token を発行する（1 回使用で無効化）。
 *
 * 検証失敗・既に無効化済み・userId 不一致はすべて 401 で返す。
 */
export const refreshTokens = async (
  input: { refreshToken: string },
  repo: { refreshTokenRepository: RefreshTokenRepository },
  verifier: RefreshVerifier,
  generators: TokenGenerators
): Promise<Result<RefreshTokensSuccess>> => {
  logger.info("AuthService: Starting refresh token rotation")

  const payload = verifier(input.refreshToken)
  if (!payload) {
    return err(unauthorizedError("Invalid refresh token"))
  }

  const userId = await repo.refreshTokenRepository.findUserId(payload.jti)
  if (userId === null || userId !== payload.userId) {
    return err(unauthorizedError("Refresh token has been revoked"))
  }

  /** ローテーション: 旧 jti を破棄して新しい jti を発行 */
  await repo.refreshTokenRepository.delete(payload.jti)

  const accessToken = generators.generateAccessToken(userId)
  const { jti, token: refreshToken } = generators.generateRefreshToken(userId)
  await repo.refreshTokenRepository.save(jti, userId, REFRESH_TTL_SECONDS)

  logger.debug("AuthService: Tokens rotated", { userId })

  return ok({ accessToken, refreshToken })
}

/**
 * ログアウト
 *
 * Refresh Token を検証して Redis から jti を削除する。冪等性を保つため、
 * 検証失敗時もエラーにせず 200 を返す（呼び出し元の Result.ok = true）。
 */
export const logout = async (
  input: { refreshToken: string },
  repo: { refreshTokenRepository: RefreshTokenRepository },
  verifier: RefreshVerifier
): Promise<Result<{ ok: true }>> => {
  logger.info("AuthService: Logout")

  const payload = verifier(input.refreshToken)
  if (!payload) {
    /** 無効なトークンでも成功扱いにして冪等性を保つ */
    return ok({ ok: true })
  }
  await repo.refreshTokenRepository.delete(payload.jti)
  return ok({ ok: true })
}
