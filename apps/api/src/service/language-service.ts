import { ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { LanguageListItem, LanguageRepository } from "../repository/prisma"

/**
 * 言語マスタを id 昇順で全件返す。
 * 読み取りのみで業務エラーは発生しないため常に ok を返す
 * （DB 障害などの想定外は repository が throw する）。
 */
export const listLanguages = async (repo: {
  languageRepository: LanguageRepository
}): Promise<Result<LanguageListItem[]>> => {
  logger.debug("listLanguages: fetching all languages")
  const languages = await repo.languageRepository.findAll()
  return ok(languages)
}
