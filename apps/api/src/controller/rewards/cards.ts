import { Response } from "express"

import {
  ErrorResponse,
  createRewardCardRequestSchema,
  createRewardCardResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { CardStorage } from "../../lib/card-storage"
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
    const { payload, type } = createRewardCardRequestSchema.parse(req.body)

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
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = createRewardCardResponseSchema.parse({
      asset_url: result.value.assetUrl,
      granted_at: result.value.grantedAt.toISOString(),
      payload: result.value.payload,
      reward_id: result.value.id,
      type: result.value.type,
    })
    return res.status(200).json(response)
  }
}
