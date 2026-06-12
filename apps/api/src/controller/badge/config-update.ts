import { Response } from "express"

import { getBadgeConfigResponseSchema, updateBadgeConfigRequestSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { requireAuth } from "../../lib/require-auth"
import { AuthRequest } from "../../middleware/auth"
import { BadgeConfigRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * PUT /api/user/badge-config
 *
 * 自分のバッジ表示設定を upsert
 */
export class BadgeConfigUpdateController {
  constructor(private badgeConfigRepository: BadgeConfigRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const userId = requireAuth(req, res)
    if (userId === null) return

    const { display_items: displayItems } = parseRequest(updateBadgeConfigRequestSchema, req.body)

    logger.info("BadgeConfigUpdateController: updating", { displayItems, userId })

    const config = await service.badge.upsertConfig(
      { displayItems, userId },
      { badgeConfigRepository: this.badgeConfigRepository },
    )

    const response = parseResponse(getBadgeConfigResponseSchema, {
      display_items: config.displayItems,
      updated_at: config.updatedAt.toISOString(),
    })
    return res.status(200).json(response)
  }
}
