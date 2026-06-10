import { Response } from "express"

import {
  createRewardCardRequestSchema,
  createRewardCardResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { CardStorage } from "../../lib/card-storage"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import {
  RewardRepository,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/rewards/cards
 *
 * 達成カード PNG の生成 (冪等 upsert)。認証必須
 */
export class RewardsCardCreateController {
  constructor(
        private cardStorage: CardStorage,
        private rewardRepository: RewardRepository,
        private userLifetimeStatsRepository: UserLifetimeStatsRepository,
        private userRepository: UserRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { payload, type } = parseRequest(createRewardCardRequestSchema, req.body)

    logger.info("RewardsCardCreateController: creating", {
      type,
      userId: req.userId,
    })

    const result = await service.rewards.createCard(
      { payload, type, userId: req.userId! },
      {
        cardStorage: this.cardStorage,
        rewardRepository: this.rewardRepository,
        userLifetimeStatsRepository: this.userLifetimeStatsRepository,
        userRepository: this.userRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(createRewardCardResponseSchema, {
      asset_url: result.value.assetUrl,
      granted_at: result.value.grantedAt.toISOString(),
      payload: result.value.payload,
      reward_id: result.value.id,
      type: result.value.type,
    })
    return res.status(200).json(response)
  }
}
