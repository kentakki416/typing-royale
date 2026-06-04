import { err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { UserRepository } from "../repository/prisma"
import { RefreshTokenRepository } from "../repository/redis"
import { User } from "../types/domain"

/**
 * ユーザーIDからユーザー情報を取得
 */
export const getUserById = async (
  userId: number,
  repo: { userRepository: UserRepository }
): Promise<Result<User>> => {
  logger.debug("UserService: Fetching user by ID", {
    userId,
  })
  const user = await repo.userRepository.findById(userId)
  if (!user) {
    logger.debug("UserService: User not found", {
      userId,
    })
    return err(notFoundError("User not found"))
  }
  logger.debug("UserService: User found", {
    userId: user.id,
  })
  return ok(user)
}

export type UpdateUserInput = {
    canPublicRanking?: boolean
    displayName?: string
}

/**
 * ユーザー情報の更新（表示名・ランキング公開設定）
 *
 * 認証ミドルウェアで req.userId を確定済みの前提のため、
 * NOT_FOUND は実質的に「アカウントが削除済み」を意味する。
 */
export const updateUser = async (
  userId: number,
  input: UpdateUserInput,
  repo: { userRepository: UserRepository }
): Promise<Result<User>> => {
  logger.debug("UserService: Updating user", { userId })

  const existing = await repo.userRepository.findById(userId)
  if (!existing) {
    return err(notFoundError("User not found"))
  }

  const updated = await repo.userRepository.update(userId, input)
  logger.info("UserService: User updated", { userId })
  return ok(updated)
}

/**
 * アカウント削除（GDPR 即時削除）
 *
 * User を削除し、FK Cascade で AuthAccount / スコア / 特典等を連動削除する。
 * Redis 上の当該ユーザーの全 Refresh Token も併せて失効させる。
 */
export const deleteAccount = async (
  userId: number,
  repo: {
    refreshTokenRepository: RefreshTokenRepository
    userRepository: UserRepository
  }
): Promise<Result<{ ok: true }>> => {
  logger.info("UserService: Deleting account", { userId })

  const existing = await repo.userRepository.findById(userId)
  if (!existing) {
    return err(notFoundError("User not found"))
  }

  await repo.userRepository.delete(userId)
  await repo.refreshTokenRepository.deleteAllByUserId(userId)
  logger.info("UserService: Account deleted", { userId })
  return ok({ ok: true })
}
