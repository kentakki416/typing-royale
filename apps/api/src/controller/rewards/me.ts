import { Response } from "express"

import { getMyRewardsQueryStringSchema, getMyRewardsResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { AuthRequest } from "../../middleware/auth"
import { RewardRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/rewards/me
 *
 * 自分の獲得済み rewards 一覧 (grantedAt DESC)。認証必須。
 * `?ids=1,2,3` で id 絞り込み（ホーム画面の pending polling 用）
 */
export class RewardsListMeController {
  constructor(private rewardRepository: RewardRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const query = parseRequest(getMyRewardsQueryStringSchema, req.query)
    const ids = query.ids === undefined ? undefined : parseIds(query.ids)
    logger.info("RewardsListMeController: listing", { ids, userId: req.userId })

    const rewards = await service.rewards.listMine(
      { ids, userId: req.userId! },
      { rewardRepository: this.rewardRepository },
    )

    const response = parseResponse(getMyRewardsResponseSchema, {
      rewards: rewards.map((r) => ({
        asset_svg_url: r.assetSvgUrl,
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

/**
 * "1,2,3" → [1, 2, 3]。空 / 不正値は除外する
 */
const parseIds = (raw: string): number[] =>
  raw.split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
