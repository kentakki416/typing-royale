import { Router } from "express"

import { RewardsCardCreateController } from "../controller/rewards/cards"
import { RewardsGenerateController } from "../controller/rewards/generate"
import { RewardsListMeController } from "../controller/rewards/me"

type RewardsRouterControllers = {
    cards?: RewardsCardCreateController
    generate?: RewardsGenerateController
    me?: RewardsListMeController
}

/**
 * /api/rewards 配下のルーター
 *
 * 全エンドポイント認証必須 (グローバル authMiddleware)
 * - GET /me: 自分の rewards 一覧 (?ids= で絞り込み可)
 * - POST /cards: 達成カード PNG 生成 (既存、grade_up 用)
 * - POST /generate: 特別バッジの冪等生成 (special-badges 用)
 */
export const rewardsRouter = (controllers: RewardsRouterControllers): Router => {
  const router = Router()

  if (controllers.me) {
    const controller = controllers.me
    router.get("/me", async (req, res) => controller.execute(req, res))
  }

  if (controllers.cards) {
    const controller = controllers.cards
    router.post("/cards", async (req, res) => controller.execute(req, res))
  }

  if (controllers.generate) {
    const controller = controllers.generate
    router.post("/generate", async (req, res) => controller.execute(req, res))
  }

  return router
}
