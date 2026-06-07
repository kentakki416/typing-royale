import { randomUUID } from "node:crypto"

import { badRequestError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { PLAY_SESSION_TTL_SECONDS, PROBLEMS_PER_SESSION } from "../const"
import {
  aggregateMistypeStats,
  aggregateProblemProgress,
  computeScore,
  MAX_KEYSTROKE_LOG_BYTES,
  isWithinPhysicalLimits,
} from "../lib/score"
import {
  CrawledRepoRepository,
  LanguageRepository,
  PlaySessionRepository,
  ProblemRepository,
} from "../repository/prisma"
import { PlaySessionStateRepository } from "../repository/redis"
import {
  FinishResult,
  KeystrokeLog,
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
 * タイピングセッションの作成
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

type FinishSessionRepo = {
    playSessionRepository: PlaySessionRepository
    playSessionStateRepository: PlaySessionStateRepository
    problemRepository: ProblemRepository
}

export type FinishSessionInput = {
    accuracy: number
    keystrokeLog: KeystrokeLog
    sessionId: string
    typedChars: number
}

/**
 * /finish のサーバー集計とアトミック DB 書き込み
 *
 * 1. 物理限界チェック（typedChars / accuracy / log size）
 * 2. Redis から PlaySessionState を取得（無ければ 404）
 * 3. state.problemIds から問題本体を取得し、件数 mismatch なら 404
 * 4. サーバーで score / mistypeStats / problemProgress を再集計
 * 5. play_sessions / play_session_problems / keystroke_logs / user_lifetime_stats を 1 transaction で書き込み
 * 6. Redis state を削除
 */
export const finishSession = async (
  input: FinishSessionInput,
  repo: FinishSessionRepo,
): Promise<Result<FinishResult>> => {
  logger.debug("PlaySessionService: Finishing session", { sessionId: input.sessionId })

  /**
   * 1. 物理限界チェック
   */
  if (!isWithinPhysicalLimits(input.typedChars, input.accuracy)) {
    return err(badRequestError("Out of physical limits"))
  }
  const logSize = Buffer.byteLength(JSON.stringify(input.keystrokeLog), "utf8")
  if (logSize > MAX_KEYSTROKE_LOG_BYTES) {
    return err(badRequestError("Keystroke log too large"))
  }

  /**
   * 2. Redis から state 取得
   */
  const state = await repo.playSessionStateRepository.findById(input.sessionId)
  if (state === null) {
    return err(notFoundError("Play session not found or expired"))
  }

  /**
   * 3. 問題 codeBlock を取得（mistype 集計と完走判定に必要）
   */
  const problems = await repo.problemRepository.findManyByIds(state.problemIds)
  if (problems.length !== state.problemIds.length) {
    logger.warn("PlaySessionService: Problem set mismatch", {
      expected: state.problemIds.length,
      found: problems.length,
    })
    return err(notFoundError("Problem set mismatch"))
  }

  /**
   * state.problemIds の順序（= orderIndex）に並べ直す
   */
  const codeBlockByOrder = new Map<number, string>()
  for (let i = 0; i < state.problemIds.length; i++) {
    const pid = state.problemIds[i]
    const p = problems.find((x) => x.id === pid)
    if (p) codeBlockByOrder.set(i, p.codeBlock)
  }

  /**
   * 4. サーバー再集計
   */
  const score = computeScore(input.typedChars, input.accuracy)
  const mistypeStats = aggregateMistypeStats(input.keystrokeLog, codeBlockByOrder)
  const progress = aggregateProblemProgress(input.keystrokeLog, codeBlockByOrder)
  const problemsCompleted = [...progress.values()].filter((v) => v.completed).length
  const playedSet = new Set(input.keystrokeLog.map((e) => e.p))
  const problemsPlayed = playedSet.size

  /**
   * 5. DB 書き込み（4 テーブルアトミックに）
   */
  await repo.playSessionRepository.createWithChildrenAndUpdateStats({
    keystrokeLog: input.keystrokeLog,
    problems: [...codeBlockByOrder.keys()].map((orderIndex) => ({
      charsTyped: progress.get(orderIndex)!.charsTyped,
      completed: progress.get(orderIndex)!.completed,
      orderIndex,
      problemId: state.problemIds[orderIndex],
    })),
    session: {
      accuracy: input.accuracy,
      crawledRepoId: state.crawledRepoId,
      ghostSessionId: state.ghostSessionId,
      languageId: state.languageId,
      mistypeStats,
      mode: state.mode,
      playedAt: new Date(),
      problemsCompleted,
      problemsPlayed,
      score,
      typedChars: input.typedChars,
      userId: state.userId,
    },
  })

  /**
   * 6. Redis ステート削除（書き込み成功時のみ）
   */
  await repo.playSessionStateRepository.delete(input.sessionId)

  logger.info("PlaySessionService: Session finished", {
    score,
    sessionId: input.sessionId,
    userId: state.userId,
  })

  return ok({
    accuracy: input.accuracy,
    mistypeStats,
    persisted: true,
    problemsCompleted,
    problemsPlayed,
    score,
    typedChars: input.typedChars,
  })
}
