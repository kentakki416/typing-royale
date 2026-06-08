import { Router } from "express"

import { BadgeConfigGetController } from "../controller/badge/config-get"
import { BadgeConfigUpdateController } from "../controller/badge/config-update"
import { UserDeleteController } from "../controller/user/delete"
import { UserGetController } from "../controller/user/get"
import { UserUpdateController } from "../controller/user/update"

type UserRouterControllers = {
  badgeConfigGet?: BadgeConfigGetController
  badgeConfigUpdate?: BadgeConfigUpdateController
  delete?: UserDeleteController
  get?: UserGetController
  update?: UserUpdateController
}

/**
 * 認証中ユーザー（自分自身）に関するルーター
 * グローバルに authMiddleware が適用済みのため、ここでは認証チェックを行わない。
 */
export const userRouter = (controllers: UserRouterControllers): Router => {
  const router = Router()

  /** GET /api/user */
  if (controllers.get) {
    const controller = controllers.get
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  /** PATCH /api/user */
  if (controllers.update) {
    const controller = controllers.update
    router.patch("/", async (req, res) => controller.execute(req, res))
  }

  /** DELETE /api/user */
  if (controllers.delete) {
    const controller = controllers.delete
    router.delete("/", async (req, res) => controller.execute(req, res))
  }

  /** GET /api/user/badge-config */
  if (controllers.badgeConfigGet) {
    const controller = controllers.badgeConfigGet
    router.get("/badge-config", async (req, res) => controller.execute(req, res))
  }

  /** PUT /api/user/badge-config */
  if (controllers.badgeConfigUpdate) {
    const controller = controllers.badgeConfigUpdate
    router.put("/badge-config", async (req, res) => controller.execute(req, res))
  }

  return router
}
