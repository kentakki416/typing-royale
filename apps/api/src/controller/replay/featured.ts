import { Request, Response } from "express"

import { getFeaturedReplaysQueryStringSchema, getFeaturedReplaysResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { ReplayRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/replays/featured?limit=N&language=...
 *
 * 注目リプレイ一覧。Hall of Fame コメント付きを `commentSubmittedAt DESC` で取得
 * 認証不要。空配列でも 200 を返す
 */
export class ReplayFeaturedController {
  constructor(
        private replayRepository: ReplayRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const { language, limit } = parseRequest(getFeaturedReplaysQueryStringSchema, req.query)

    logger.info("ReplayFeaturedController: Listing featured replays", { language, limit })

    const items = await service.replay.listFeatured(
      { language, limit },
      { replayRepository: this.replayRepository },
    )

    const response = parseResponse(getFeaturedReplaysResponseSchema, {
      items: items.map((row) => ({
        comment: row.comment,
        comment_submitted_at: row.commentSubmittedAt.toISOString(),
        language: row.language.slug,
        play_session_id: row.playSession.id,
        player: {
          avatar_url: row.user.avatarUrl,
          current_grade: row.user.currentGrade ?? "intern",
          display_name: row.user.displayName ?? `user${row.user.id}`,
          user_id: row.user.id,
        },
        stats: {
          accuracy: row.playSession.accuracy,
          score: row.playSession.score,
          typed_chars: row.playSession.typedChars,
        },
      })),
    })
    return res.status(200).json(response)
  }
}
