import { err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import {
  LanguageRepository,
  UserLanguageBestRepository,
  UserLanguageBestWithUser,
} from "../repository/prisma"

type ListRepo = {
    languageRepository: LanguageRepository
    userLanguageBestRepository: UserLanguageBestRepository
}

export type ListInput = {
    languageSlug: string
}

export type ListEntry = UserLanguageBestWithUser & {
    rank: number
}

export type ListOutput = {
    entries: ListEntry[]
    language: string
}

/**
 * 言語別 Hall of Fame の取得
 *
 * 1. language slug → id 解決（無ければ 404）
 * 2. user_language_best から TOP 10 を score-ranking step2 流用で取得
 * 3. rank を 1..N で採番
 */
export const list = async (
  input: ListInput,
  repo: ListRepo,
): Promise<Result<ListOutput>> => {
  logger.debug("HallOfFameService: list", { language: input.languageSlug })

  const language = await repo.languageRepository.findBySlug(input.languageSlug)
  if (!language) return err(notFoundError("Language not found"))

  const top = await repo.userLanguageBestRepository.findTopByLanguage(language.id, 10)
  const entries = top.map((e, idx) => ({ ...e, rank: idx + 1 }))

  return ok({
    entries,
    language: input.languageSlug,
  })
}
