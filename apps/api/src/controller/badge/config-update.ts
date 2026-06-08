import { Response } from "express"

import { getBadgeConfigResponseSchema, updateBadgeConfigRequestSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

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
    const { display_items: displayItems } = updateBadgeConfigRequestSchema.parse(req.body)

    logger.info("BadgeConfigUpdateController: updating", { displayItems, userId: req.userId })

    const config = await service.badge.upsertConfig(
      { displayItems, userId: req.userId! },
      { badgeConfigRepository: this.badgeConfigRepository },
    )

    const response = getBadgeConfigResponseSchema.parse({
      display_items: config.displayItems,
      updated_at: config.updatedAt.toISOString(),
    })
    return res.status(200).json(response)
  }
}
