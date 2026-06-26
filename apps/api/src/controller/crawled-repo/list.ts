import { Request, Response } from "express"

import {
  getCrawledReposQueryStringSchema,
  getCrawledReposResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import {
  CrawledRepoListItem,
  CrawledRepoRepository,
  LanguageRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/crawled-repos
 *
 * 言語別の有効リポジトリ一覧を stars 降順で返す。認証不要（公開）
 */
export class CrawledRepoListController {
  constructor(
        private crawledRepoRepository: CrawledRepoRepository,
        private languageRepository: LanguageRepository,
  ) {}

  async execute(req: Request, res: Response) {
    const query = parseRequest(getCrawledReposQueryStringSchema, req.query)

    logger.info("CrawledRepoListController: Listing crawled repos", {
      language: query.language,
      limit: query.limit,
      offset: query.offset,
    })

    const result = await service.crawledRepo.listByLanguage(
      { languageSlug: query.language, limit: query.limit, offset: query.offset },
      {
        crawledRepoRepository: this.crawledRepoRepository,
        languageRepository: this.languageRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getCrawledReposResponseSchema, {
      entries: result.value.entries.map((e: CrawledRepoListItem) => ({
        description: e.description,
        full_name: e.fullName,
        homepage: e.homepage,
        name: e.name,
        owner: e.owner,
        stars: e.stars,
        stored_count: e.storedCount,
        topics: e.topics,
      })),
      language: result.value.languageSlug,
      total: result.value.total,
    })
    return res.status(200).json(response)
  }
}
