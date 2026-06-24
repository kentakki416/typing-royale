import { Router } from "express"

import { RewardsCardCreateController } from "../controller/rewards/cards"
import { RewardsListMeController } from "../controller/rewards/me"

type RewardsRouterControllers = {
    cards?: RewardsCardCreateController
    me?: RewardsListMeController
}

/**
 * /api/rewards 配下のルーター
 *
 * 全エンドポイント認証必須 (グローバル authMiddleware)
 * - GET /me: 自分の rewards 一覧 (?ids= で絞り込み可)
 * - POST /cards: 達成カード PNG 生成 (既存、grade_up 用)
 *
 * 旧 POST /generate (special-badges の冪等生成) は rewards-worker step3 で廃止。
 * 画像生成は /finish の enqueue → apps/worker に一本化した
 */
export const rewardsRouter = (controllers: RewardsRouterControllers): Router => {
  const router = Router()

  if (controllers.me) {
    const controller = controllers.me
    router.get("/me", async (req, res) => controller.execute(req, res))
  }

  if (controllers.cards) {
    const controller = controllers.cards
    router.post("/cards", async (req, res) => controller.execute(req, res))
  }

  return router
}
