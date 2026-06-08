import { Request, Response } from "express"

import { getBadgeSvgPathParamSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { getBadRequestBadgeSvg } from "../../lib/badge-svg"
import {
  BadgeConfigRepository,
  LanguageRepository,
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../../repository/prisma"
import * as service from "../../service"

const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600"

/**
 * GET /badge/:username.svg
 *
 * 動的 SVG バッジ。認証不要（公開、CDN キャッシュ前提）。
 * 404 を返さず常に 200 + image/svg+xml で SVG を返す（不在 / Private は
 * 固定文言の SVG）
 */
export class BadgeSvgController {
  constructor(
        private badgeConfigRepository: BadgeConfigRepository,
        private languageRepository: LanguageRepository,
        private userLanguageBestRepository: UserLanguageBestRepository,
        private userLifetimeStatsRepository: UserLifetimeStatsRepository,
        private userRepository: UserRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const parsed = getBadgeSvgPathParamSchema.safeParse(req.params)
    if (!parsed.success) {
      res.setHeader("Content-Type", "image/svg+xml")
      res.setHeader("Cache-Control", CACHE_CONTROL)
      return res.status(200).send(getBadRequestBadgeSvg())
    }

    logger.info("BadgeSvgController: rendering", { username: parsed.data.username })

    const result = await service.badge.render(
      { username: parsed.data.username },
      {
        badgeConfigRepository: this.badgeConfigRepository,
        languageRepository: this.languageRepository,
        userLanguageBestRepository: this.userLanguageBestRepository,
        userLifetimeStatsRepository: this.userLifetimeStatsRepository,
        userRepository: this.userRepository,
      },
    )

    res.setHeader("Content-Type", "image/svg+xml")
    res.setHeader("Cache-Control", CACHE_CONTROL)
    return res.status(200).send(result.svg)
  }
}
