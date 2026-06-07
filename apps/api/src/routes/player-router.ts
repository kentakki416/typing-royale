import { Router } from "express"

import { PlayerDetailController } from "../controller/player/detail"

type PlayerRouterControllers = {
    detail?: PlayerDetailController
}

/**
 * /api/players 配下のルーター
 *
 * GET /api/players/:userId は公開（authMiddleware の PUBLIC_PATHS で許可）
 */
export const playerRouter = (controllers: PlayerRouterControllers): Router => {
  const router = Router()

  if (controllers.detail) {
    const controller = controllers.detail
    router.get("/:userId", async (req, res) => controller.execute(req, res))
  }

  return router
}
