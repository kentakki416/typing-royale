import { Router } from "express"

import { LanguageListController } from "../controller/language/list"

type LanguageRouterControllers = {
  list?: LanguageListController
}

/**
 * /api/languages
 */
export const languageRouter = (controllers: LanguageRouterControllers): Router => {
  const router = Router()

  if (controllers.list) {
    router.get("/", async (req, res) => controllers.list!.execute(req, res))
  }

  return router
}
