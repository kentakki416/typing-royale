import { Router } from "express"

import { CrawledRepoListController } from "../controller/crawled-repo/list"

type CrawledRepoRouterControllers = {
    list?: CrawledRepoListController
}

/**
 * /api/crawled-repos 配下のルーター
 *
 * - GET /api/crawled-repos: 公開（authMiddleware で PUBLIC_PATHS 扱い）
 */
export const crawledRepoRouter = (controllers: CrawledRepoRouterControllers): Router => {
  const router = Router()

  if (controllers.list) {
    const controller = controllers.list
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
