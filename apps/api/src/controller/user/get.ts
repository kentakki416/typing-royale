import { Response } from "express"

import { getUserResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { normalizeMistypeStats, totalMistypeCount } from "../../lib/mistype-stats"
import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PlaySessionRepository, UserLifetimeStatsRepository, UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * マイページに出す苦手文字の件数（誤打数の多い順）
 */
const WEAK_CHARS_LIMIT = 10

/**
 * 各苦手文字に併記する「実際に打った文字」の内訳件数（回数降順）
 */
const MISTYPED_BREAKDOWN_LIMIT = 3

type WeakChar = {
  char: string
  count: number
  mistyped: { char: string; count: number }[]
}

/**
 * 生涯通算の誤打集計（flat / nested 混在可）を
 * 「苦手文字 top N（合計誤打数降順）+ 各誤入力内訳 top M」に整形する
 */
const toWeakChars = (raw: unknown): WeakChar[] =>
  Object.entries(normalizeMistypeStats(raw))
    .map(([char, inner]) => ({
      char,
      count: totalMistypeCount(inner),
      mistyped: Object.entries(inner)
        .sort(([, a], [, b]) => b - a)
        .slice(0, MISTYPED_BREAKDOWN_LIMIT)
        .map(([mistypedChar, count]) => ({ char: mistypedChar, count })),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, WEAK_CHARS_LIMIT)

/**
 * GET /api/user
 *
 * 認証中ユーザー自身の情報 + マイページサマリー用の集計
 * （平均正確率 / 得意なリポジトリ / 苦手文字 top N）を返す。
 * req.userId は authMiddleware が確定済みの前提。
 */
export class UserGetController {
  constructor(
    private userRepository: UserRepository,
    private userLifetimeStatsRepository: UserLifetimeStatsRepository,
    private playSessionRepository: PlaySessionRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("UserGetController: Fetching authenticated user", {
      requestedUserId: req.userId,
    })

    const [result, lifetime, summary] = await Promise.all([
      service.user.getUserById(req.userId!, { userRepository: this.userRepository }),
      this.userLifetimeStatsRepository.findByUserId(req.userId!),
      this.playSessionRepository.getUserSummaryStats(req.userId!),
    ])

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getUserResponseSchema, {
      avatar_url: result.value.avatarUrl,
      avg_accuracy: summary.avgAccuracy,
      best_repo: summary.bestRepo === null
        ? null
        : { avg_score: summary.bestRepo.avgScore, full_name: summary.bestRepo.fullName },
      can_public_ranking: result.value.canPublicRanking,
      created_at: result.value.createdAt.toISOString(),
      github_username: result.value.githubUsername,
      email: result.value.email,
      favorite_repo_url: result.value.favoriteRepoUrl,
      id: result.value.id,
      weak_chars: toWeakChars(lifetime?.lifetimeMistypeStats),
    })

    return res.status(200).json(response)
  }
}
