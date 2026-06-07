import { randomUUID } from "node:crypto"

import { badRequestError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { PLAY_SESSION_TTL_SECONDS, PROBLEMS_PER_SESSION } from "../const"
import {
  CrawledRepoRepository,
  LanguageRepository,
  ProblemRepository,
} from "../repository/prisma"
import { PlaySessionStateRepository } from "../repository/redis"
import {
  PlaySessionProblem,
  PlaySessionState,
  RepoInfo,
} from "../types/domain"

type SoloSessionRepo = {
    crawledRepoRepository: CrawledRepoRepository
    languageRepository: LanguageRepository
    playSessionStateRepository: PlaySessionStateRepository
    problemRepository: ProblemRepository
}

export type CreateSoloSessionInput = {
    languageId: number
    userId: number
}

export type CreateSoloSessionOutput = {
    problems: PlaySessionProblem[]
    repoInfo: RepoInfo
    sessionId: string
}

/**
 * `POST /api/play-sessions/solo` 本体
 *
 * 1. 言語存在チェック → なければ 400
 * 2. eligible repo を 1 件抽選 → 無ければ 404
 * 3. その repo から 20 問抽選 → 20 問揃わなければ 404（プール仕様上は通常発生しない）
 * 4. Redis にステート保存（TTL 300 秒）
 */
export const createSoloSession = async (
  input: CreateSoloSessionInput,
  repo: SoloSessionRepo,
): Promise<Result<CreateSoloSessionOutput>> => {
  logger.debug("PlaySessionService: Creating solo session", { ...input })

  /**
   * 1. 言語存在チェック
   */
  const languageExists = await repo.languageRepository.existsById(input.languageId)
  if (!languageExists) {
    return err(badRequestError("Invalid language_id"))
  }

  /**
   * 2. eligible repo を 1 件抽選
   */
  const mainRepo = await repo.crawledRepoRepository.pickRandomEligibleByLanguageId(input.languageId)
  if (mainRepo === null) {
    return err(notFoundError("No eligible repository for the given language"))
  }

  /**
   * 3. メイン repo から 20 問抽選。揃わなければ 404
   * （pool 仕様上 eligible repo は 30 問保証なので通常発生しない）
   */
  const problems = await repo.problemRepository.pickRandomByCrawledRepoId(
    mainRepo.id,
    PROBLEMS_PER_SESSION,
  )
  if (problems.length < PROBLEMS_PER_SESSION) {
    logger.warn("PlaySessionService: Repo has insufficient problems", {
      available: problems.length,
      crawledRepoId: mainRepo.id,
    })
    return err(notFoundError("Insufficient problems in the selected repository"))
  }

  /**
   * orderIndex を 0..19 で振り直す
   */
  const orderedProblems: PlaySessionProblem[] = problems.map((p, i) => ({
    ...p,
    orderIndex: i,
  }))

  /**
   * 4. Redis にステート保存
   */
  const sessionId = randomUUID()
  const state: PlaySessionState = {
    crawledRepoId: mainRepo.id,
    ghostSessionId: null,
    languageId: input.languageId,
    mode: "solo",
    problemIds: orderedProblems.map((p) => p.id),
    userId: input.userId,
  }
  await repo.playSessionStateRepository.save(sessionId, state, PLAY_SESSION_TTL_SECONDS)

  logger.debug("PlaySessionService: Solo session created", {
    crawledRepoId: mainRepo.id,
    problemCount: orderedProblems.length,
    sessionId,
  })

  return ok({
    problems: orderedProblems,
    repoInfo: mainRepo.repoInfo,
    sessionId,
  })
}
