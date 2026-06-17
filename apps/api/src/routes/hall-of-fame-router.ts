import { Router } from "express"

import { HallOfFameListController } from "../controller/hall-of-fame/list"

type HallOfFameRouterControllers = {
    list?: HallOfFameListController
}

/**
 * /api/hall-of-fame 配下のルーター
 *
 * - GET /api/hall-of-fame: 公開（PUBLIC_PATHS）
 */
export const hallOfFameRouter = (controllers: HallOfFameRouterControllers): Router => {
  const router = Router()

  if (controllers.list) {
    const controller = controllers.list
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
