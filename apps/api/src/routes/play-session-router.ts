import { Router } from "express"

import { PlaySessionFinishController } from "../controller/play-session/finish"
import { PlaySessionStartSoloController } from "../controller/play-session/start-solo"

type PlaySessionRouterControllers = {
    finish?: PlaySessionFinishController
    startSolo?: PlaySessionStartSoloController
}

/**
 * /api/play-sessions 配下のルーター
 * step2: /solo、step3: /:id/finish、step6 で /challenge-gods を追加予定
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

  /**
   * POST /api/play-sessions/:id/finish
   */
  if (controllers.finish) {
    const controller = controllers.finish
    router.post("/:id/finish", async (req, res) => controller.execute(req, res))
  }

  return router
}
