import { Router } from "express"

import { BadgeSvgController } from "../controller/badge/svg"

type BadgeRouterControllers = {
    svg?: BadgeSvgController
}

/**
 * /badge 配下のルーター（公開、CDN キャッシュ前提）
 *
 * `:username.svg` の `.svg` は Express のパスマッチで吸収する
 */
export const badgeRouter = (controllers: BadgeRouterControllers): Router => {
  const router = Router()

  if (controllers.svg) {
    const controller = controllers.svg
    router.get("/:username.svg", async (req, res) => controller.execute(req, res))
  }

  return router
}
