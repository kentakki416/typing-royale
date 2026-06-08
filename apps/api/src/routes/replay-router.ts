import { Router } from "express"

import { ReplayFeaturedController } from "../controller/replay/featured"
import { ReplayGetController } from "../controller/replay/get"

type ReplayRouterControllers = {
    featured?: ReplayFeaturedController
    get?: ReplayGetController
}

/**
 * /api/replays 配下のルーター
 *
 * 注意: `/featured` は `/:playSessionId` より **先** に登録する
 * （Express の route match 順）
 */
export const replayRouter = (controllers: ReplayRouterControllers): Router => {
  const router = Router()

  /**
   * GET /api/replays/featured
   */
  if (controllers.featured) {
    const controller = controllers.featured
    router.get("/featured", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/replays/:playSessionId
   */
  if (controllers.get) {
    const controller = controllers.get
    router.get("/:playSessionId", async (req, res) => controller.execute(req, res))
  }

  return router
}
