import { Router } from "express"

import { RewardsCardCreateController } from "../controller/rewards/cards"
import { RewardsListMeController } from "../controller/rewards/me"

type RewardsRouterControllers = {
    cards?: RewardsCardCreateController
    me?: RewardsListMeController
}

/**
 * /api/rewards 配下のルーター
 *
 * POST /cards + GET /me 共に認証必須 (グローバル authMiddleware)
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

  return router
}
