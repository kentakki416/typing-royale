import { Router } from "express"

import { PlaySessionStartSoloController } from "../controller/play-session/start-solo"

type PlaySessionRouterControllers = {
    startSolo?: PlaySessionStartSoloController
}

/**
 * /api/play-sessions 配下のルーター
 * step2: /solo のみ。step3 で /:id/finish、step6 で /challenge-gods を追加
 */
export const playSessionRouter = (controllers: PlaySessionRouterControllers): Router => {
  const router = Router()

  /**
   * POST /api/play-sessions/solo
   */
  if (controllers.startSolo) {
    const controller = controllers.startSolo
    router.post("/solo", async (req, res) => controller.execute(req, res))
  }

  return router
}
