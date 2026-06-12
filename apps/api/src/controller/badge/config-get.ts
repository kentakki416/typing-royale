import { Response } from "express"

import { getBadgeConfigResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { requireAuth } from "../../lib/require-auth"
import { AuthRequest } from "../../middleware/auth"
import { BadgeConfigRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/user/badge-config
 *
 * 自分のバッジ表示設定を返す。未保存ユーザーでも defaults を返す（200）
 */
export class BadgeConfigGetController {
  constructor(private badgeConfigRepository: BadgeConfigRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const userId = requireAuth(req, res)
    if (userId === null) return

    logger.info("BadgeConfigGetController: fetching", { userId })

    const config = await service.badge.getConfig(
      { userId },
      { badgeConfigRepository: this.badgeConfigRepository },
    )

    const response = parseResponse(getBadgeConfigResponseSchema, {
      display_items: config.displayItems,
      updated_at: config.updatedAt.toISOString(),
    })
    return res.status(200).json(response)
  }
}
