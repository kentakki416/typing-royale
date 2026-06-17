import { Request, Response } from "express"

import {
  getMonthlyRankingsQueryStringSchema,
  getMonthlyRankingsResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import {
  LanguageRepository,
  MonthlyRankingSnapshotRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/rankings/monthly
 *
 * 当月の言語別 TOP N（上位 10 位までを保存しているので limit は最大 10）。認証不要（公開）
 */
export class RankingMonthlyListController {
  constructor(
        private languageRepository: LanguageRepository,
        private monthlyRankingSnapshotRepository: MonthlyRankingSnapshotRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const query = parseRequest(getMonthlyRankingsQueryStringSchema, req.query)

    logger.info("RankingMonthlyListController: Listing monthly rankings", {
      language: query.language,
      limit: query.limit,
    })

    const result = await service.ranking.listMonthly(
      { languageSlug: query.language, limit: query.limit },
      {
        languageRepository: this.languageRepository,
        monthlyRankingSnapshotRepository: this.monthlyRankingSnapshotRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getMonthlyRankingsResponseSchema, {
      entries: result.value.entries.map((e) => ({
        accuracy: e.accuracy,
        played_at: e.playedAt.toISOString(),
        rank: e.rank,
        score: e.score,
        user: {
          id: e.user.id,
          avatar_url: e.user.avatarUrl,
          current_grade: e.user.currentGrade,
          github_username: e.user.githubUsername,
        },
      })),
      year_month: result.value.yearMonth,
    })
    return res.status(200).json(response)
  }
}
