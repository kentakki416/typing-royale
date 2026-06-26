import { Request, Response } from "express"

import { getLanguagesResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { LanguageRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/languages
 *
 * 言語マスタを id 昇順で全件返す。認証不要（公開）
 */
export class LanguageListController {
  constructor(private languageRepository: LanguageRepository) {}

  async execute(req: Request, res: Response) {
    logger.info("LanguageListController: listing languages")

    const result = await service.language.listLanguages({
      languageRepository: this.languageRepository,
    })
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getLanguagesResponseSchema, {
      languages: result.value,
    })
    return res.status(200).json(response)
  }
}
