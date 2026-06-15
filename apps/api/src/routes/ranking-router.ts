import { Router } from "express"

import { RankingListController } from "../controller/ranking/list"
import { RankingMeController } from "../controller/ranking/me"
import { RankingMonthlyListController } from "../controller/ranking/monthly-list"

type RankingRouterControllers = {
    list?: RankingListController
    me?: RankingMeController
    monthlyList?: RankingMonthlyListController
}

/**
 * /api/rankings 配下のルーター
 *
 * - GET /api/rankings:         公開（authMiddleware で PUBLIC_PATHS 扱い）
 * - GET /api/rankings/monthly: 公開
 * - GET /api/rankings/me:      認証必須（authMiddleware の PROTECTED_PATHS で除外指定）
 */
export const rankingRouter = (controllers: RankingRouterControllers): Router => {
  const router = Router()

  /**
   * GET /api/rankings/me （/ より前に登録して prefix 衝突を回避）
   */
  if (controllers.me) {
    const controller = controllers.me
    router.get("/me", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/rankings/monthly
   */
  if (controllers.monthlyList) {
    const controller = controllers.monthlyList
    router.get("/monthly", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/rankings
   */
  if (controllers.list) {
    const controller = controllers.list
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
