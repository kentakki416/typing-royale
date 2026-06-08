import { Router } from "express"

import { HallOfFameCommentCreateController } from "../controller/hall-of-fame/comment-create"
import { HallOfFameCommentUpdateController } from "../controller/hall-of-fame/comment-update"
import { HallOfFameListController } from "../controller/hall-of-fame/list"

type HallOfFameRouterControllers = {
    commentCreate?: HallOfFameCommentCreateController
    commentUpdate?: HallOfFameCommentUpdateController
    list?: HallOfFameListController
}

/**
 * /api/hall-of-fame 配下のルーター
 *
 * - GET /api/hall-of-fame: 公開（PUBLIC_PATHS）
 * - POST/PATCH /api/hall-of-fame/comments[:entryId]: 認証必須（PROTECTED_PATHS）
 */
export const hallOfFameRouter = (controllers: HallOfFameRouterControllers): Router => {
  const router = Router()

  if (controllers.commentCreate) {
    const controller = controllers.commentCreate
    router.post("/comments", async (req, res) => controller.execute(req, res))
  }

  if (controllers.commentUpdate) {
    const controller = controllers.commentUpdate
    router.patch("/comments/:entryId", async (req, res) => controller.execute(req, res))
  }

  if (controllers.list) {
    const controller = controllers.list
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
