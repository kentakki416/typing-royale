import { Router } from "express"

import { ReplayGetController } from "../controller/replay/get"

type ReplayRouterControllers = {
    get?: ReplayGetController
}

/**
 * /api/replays 配下のルーター
 */
export const replayRouter = (controllers: ReplayRouterControllers): Router => {
  const router = Router()

  /**
   * GET /api/replays/:playSessionId
   */
  if (controllers.get) {
    const controller = controllers.get
    router.get("/:playSessionId", async (req, res) => controller.execute(req, res))
  }

  return router
}
