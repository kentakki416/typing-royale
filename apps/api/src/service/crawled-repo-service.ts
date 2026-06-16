import { err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { CrawledRepoListItem, CrawledRepoRepository, LanguageRepository } from "../repository/prisma"

type ListByLanguageRepo = {
    crawledRepoRepository: CrawledRepoRepository
    languageRepository: LanguageRepository
}

export type ListByLanguageInput = {
    languageSlug: string
    limit: number
}

export type ListByLanguageOutput = {
    entries: CrawledRepoListItem[]
    languageSlug: string
}

/**
 * 指定言語の有効リポジトリを stars 降順で一覧取得
 *
 * - languageSlug が存在しないと NOT_FOUND
 * - disabled=false かつ storedCount>0 でフィルタ
 */
export const listByLanguage = async (
  input: ListByLanguageInput,
  repo: ListByLanguageRepo,
): Promise<Result<ListByLanguageOutput>> => {
  logger.debug("CrawledRepoService: listByLanguage", { languageSlug: input.languageSlug })

  const language = await repo.languageRepository.findBySlug(input.languageSlug)
  if (language === null) {
    return err(notFoundError("Language not found"))
  }

  const entries = await repo.crawledRepoRepository.findActiveByLanguageId(language.id, input.limit)

  return ok({
    entries,
    languageSlug: input.languageSlug,
  })
}
