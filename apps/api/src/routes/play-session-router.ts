import { Router } from "express"

import { PlaySessionFinishController } from "../controller/play-session/finish"
import { PlaySessionGuestFinishController } from "../controller/play-session/guest-finish"
import { PlaySessionGuestStartChallengeGodsController } from "../controller/play-session/guest-start-challenge-gods"
import { PlaySessionGuestStartSoloController } from "../controller/play-session/guest-start-solo"
import { PlaySessionStartChallengeGodsController } from "../controller/play-session/start-challenge-gods"
import { PlaySessionStartSoloController } from "../controller/play-session/start-solo"

type PlaySessionRouterControllers = {
    finish?: PlaySessionFinishController
    guestFinish?: PlaySessionGuestFinishController
    guestStartChallengeGods?: PlaySessionGuestStartChallengeGodsController
    guestStartSolo?: PlaySessionGuestStartSoloController
    startChallengeGods?: PlaySessionStartChallengeGodsController
    startSolo?: PlaySessionStartSoloController
}

/**
 * /api/play-sessions 配下のルーター
 *
 * 認証必須経路（/solo /challenge-gods /:id/finish）と
 * ゲスト用ステートレス経路（/guest/solo /guest/challenge-gods /guest/finish）を
 * 同じ router に登録する。認証分岐は authMiddleware が PUBLIC_PATHS で吸収。
 *
 * 「先に静的な /guest 系を登録 → 後で動的な /:id/finish を登録」しないと、
 * Express の path 解決で /:id/finish が /guest/finish を吸ってしまうため、
 * guest 系の route は必ず /:id/finish より前に登録する。
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
   * POST /api/play-sessions/challenge-gods
   */
  if (controllers.startChallengeGods) {
    const controller = controllers.startChallengeGods
    router.post("/challenge-gods", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/play-sessions/guest/solo
   */
  if (controllers.guestStartSolo) {
    const controller = controllers.guestStartSolo
    router.post("/guest/solo", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/play-sessions/guest/challenge-gods
   */
  if (controllers.guestStartChallengeGods) {
    const controller = controllers.guestStartChallengeGods
    router.post("/guest/challenge-gods", async (req, res) => controller.execute(req, res))
  }

  /**
   * POST /api/play-sessions/guest/finish
   * （/:id/finish より前に登録）
   */
  if (controllers.guestFinish) {
    const controller = controllers.guestFinish
    router.post("/guest/finish", async (req, res) => controller.execute(req, res))
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
