import { Response } from "express"

import { generateRewardRequestSchema, generateRewardResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { CardStorage } from "../../lib/card-storage"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { RewardRepository, UserRepository ,type RewardRow } from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/rewards/generate
 *
 * 殿堂入り / 月間 TOP 10 入賞バッジの冪等生成エンドポイント。クライアントは
 * /finish レスポンスの `pending_rewards` を見て fire-and-forget で叩く。
 * 冪等性により二重発火 / リトライ / ページリロードに対して安全。
 *
 * 詳細は docs/spec/special-badges/step2-api-rewards-generate.md 参照
 */
export class RewardsGenerateController {
  constructor(
    private rewardRepository: RewardRepository,
    private userRepository: UserRepository,
    private cardStorage: CardStorage,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const body = parseRequest(generateRewardRequestSchema, req.body)
    logger.info("RewardsGenerateController: generating", { type: body.type, userId: req.userId })

    const input = body.type === "hall_of_fame_in"
      ? { language: body.language, rank: body.rank, type: body.type } as const
      : {
        language: body.language,
        rank: body.rank,
        type: body.type,
        yearMonth: body.year_month,
      } as const

    const result = await service.rewards.generateReward(
      req.userId!,
      input,
      {
        cardStorage: this.cardStorage,
        rewardRepository: this.rewardRepository,
        userRepository: this.userRepository,
      },
    )
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(generateRewardResponseSchema, toResponseEntry(result.value))
    return res.status(200).json(response)
  }
}

const toResponseEntry = (r: RewardRow) => ({
  asset_svg_url: r.assetSvgUrl,
  asset_url: r.assetUrl,
  granted_at: r.grantedAt.toISOString(),
  payload: r.payload,
  reward_id: r.id,
  type: r.type,
})
