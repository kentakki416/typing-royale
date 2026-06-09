import { Response } from "express"

import { getMyRewardsResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { AuthRequest } from "../../middleware/auth"
import { RewardRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/rewards/me
 *
 * 自分の獲得済み rewards 一覧 (grantedAt DESC)。認証必須
 */
export class RewardsListMeController {
  constructor(private rewardRepository: RewardRepository) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("RewardsListMeController: listing", { userId: req.userId })

    const rewards = await service.rewards.listMine(
      { userId: req.userId! },
      { rewardRepository: this.rewardRepository },
    )

    const response = parseResponse(getMyRewardsResponseSchema, {
      rewards: rewards.map((r) => ({
        asset_url: r.assetUrl,
        granted_at: r.grantedAt.toISOString(),
        payload: r.payload,
        reward_id: r.id,
        type: r.type,
      })),
    })
    return res.status(200).json(response)
  }
}
