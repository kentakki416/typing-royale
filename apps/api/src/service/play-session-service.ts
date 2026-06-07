import { randomUUID } from "node:crypto"

import { badRequestError, conflictError, err, notFoundError, ok, Result } from "@repo/errors"
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
  GhostSourceSession,
  KeystrokeLogRepository,
  LanguageRepository,
  PlaySessionProblemRepository,
  PlaySessionRepository,
  ProblemRepository,
  RankingSnapshotRepository,
  RankingTopEntry,
  TransactionRunner,
  UserLifetimeStatsRepository,
} from "../repository/prisma"
import { PlaySessionStateRepository } from "../repository/redis"
import {
  FinishResult,
  KeystrokeLogs,
  MistypeStats,
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
    keystrokeLogRepository: KeystrokeLogRepository
    playSessionProblemRepository: PlaySessionProblemRepository
    playSessionRepository: PlaySessionRepository
    playSessionStateRepository: PlaySessionStateRepository
    problemRepository: ProblemRepository
    transactionRunner: TransactionRunner
    userLifetimeStatsRepository: UserLifetimeStatsRepository
}

export type FinishSessionInput = {
    accuracy: number
    keystrokeLogs: KeystrokeLogs
    sessionId: string
    typedChars: number
}

/**
 * state.problemIds の順序 (= orderIndex) で codeBlock を引ける Map を構築する。
 *
 * problemRepository.findManyByIds は順序保証がないため、orderIndex (0..19) から
 * codeBlock を引きやすい形に並べ直す。直後の aggregateMistypeStats /
 * aggregateProblemProgress / play_session_problems の INSERT で使う
 */
const buildCodeBlockByOrder = (
  problemIds: number[],
  problems: Array<{ id: number; codeBlock: string }>,
): Map<number, string> => {
  const map = new Map<number, string>()
  for (let i = 0; i < problemIds.length; i++) {
    const pid = problemIds[i]
    const p = problems.find((x) => x.id === pid)
    if (p) map.set(i, p.codeBlock)
  }
  return map
}

type PersistFinishedSessionInput = {
    accuracy: number
    keystrokeLogs: KeystrokeLogs
    mistypeStats: MistypeStats
    problemProgress: Map<number, { charsTyped: number; completed: boolean }>
    problemsCompleted: number
    problemsPlayed: number
    score: number
    state: PlaySessionState
    typedChars: number
}

/**
 * 4 テーブル (play_sessions / play_session_problems / keystroke_logs /
 * user_lifetime_stats) を 1 transaction でアトミックに書き込む。
 * Service が境界を制御し、各 Repository に tx を渡す（auth-service と同流派）
 */
const persistFinishedSessionAtomic = async (
  data: PersistFinishedSessionInput,
  repo: FinishSessionRepo,
): Promise<void> => {
  await repo.transactionRunner.run(async (tx) => {
    const session = await repo.playSessionRepository.create(
      {
        accuracy: data.accuracy,
        crawledRepoId: data.state.crawledRepoId,
        ghostSessionId: data.state.ghostSessionId,
        languageId: data.state.languageId,
        mistypeStats: data.mistypeStats,
        mode: data.state.mode,
        playedAt: new Date(),
        problemsCompleted: data.problemsCompleted,
        problemsPlayed: data.problemsPlayed,
        score: data.score,
        typedChars: data.typedChars,
        userId: data.state.userId,
      },
      tx,
    )

    await repo.playSessionProblemRepository.createMany(
      session.id,
      [...data.problemProgress.keys()].map((orderIndex) => ({
        charsTyped: data.problemProgress.get(orderIndex)!.charsTyped,
        completed: data.problemProgress.get(orderIndex)!.completed,
        orderIndex,
        problemId: data.state.problemIds[orderIndex],
      })),
      tx,
    )

    await repo.keystrokeLogRepository.create(session.id, data.keystrokeLogs, tx)

    await repo.userLifetimeStatsRepository.upsertOnFinish(
      {
        languageId: data.state.languageId,
        mistypeStats: data.mistypeStats,
        score: data.score,
        typedChars: data.typedChars,
        userId: data.state.userId,
      },
      tx,
    )
  })
}

/**
 * タイピングセッションのスコア集計とアトミック DB 書き込み
 *
 * 1. 物理限界チェック（typedChars / accuracy / log size）
 * 2. Redis から PlaySessionState を取得（無ければ 404）
 * 3. state.problemIds から問題本体を取得し、件数 mismatch なら 404
 * 4. サーバーで score / mistypeStats / problemProgress を再集計
 * 5. 4 テーブルを 1 transaction で書き込み (persistFinishedSessionAtomic)
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
  const logSize = Buffer.byteLength(JSON.stringify(input.keystrokeLogs), "utf8")
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
  const codeBlockByOrder = buildCodeBlockByOrder(state.problemIds, problems)

  /**
   * 4. サーバー再集計
   */
  const score = computeScore(input.typedChars, input.accuracy)
  const mistypeStats = aggregateMistypeStats(input.keystrokeLogs, codeBlockByOrder)
  const progress = aggregateProblemProgress(input.keystrokeLogs, codeBlockByOrder)
  const problemsCompleted = [...progress.values()].filter((v) => v.completed).length
  const problemsPlayed = new Set(input.keystrokeLogs.map((e) => e.problemIndex)).size

  /**
   * 5. DB 書き込み (4 テーブル / 1 transaction)
   */
  await persistFinishedSessionAtomic(
    {
      accuracy: input.accuracy,
      keystrokeLogs: input.keystrokeLogs,
      mistypeStats,
      problemProgress: progress,
      problemsCompleted,
      problemsPlayed,
      score,
      state,
      typedChars: input.typedChars,
    },
    repo,
  )

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

type ChallengeGodsRepo = {
    keystrokeLogRepository: KeystrokeLogRepository
    languageRepository: LanguageRepository
    playSessionRepository: PlaySessionRepository
    playSessionStateRepository: PlaySessionStateRepository
    problemRepository: ProblemRepository
    rankingSnapshotRepository: RankingSnapshotRepository
}

export type CreateChallengeGodsInput = {
    languageId: number
    userId: number
}

export type CreateChallengeGodsOutput = {
    ghostKeystrokeLogs: KeystrokeLogs
    ghostSessionId: number
    ghostUserDisplay: {
        avatarUrl: string | null
        bestScore: number
        displayName: string
        grade: string
    }
    problems: PlaySessionProblem[]
    repoInfo: RepoInfo
    sessionId: string
}

/**
 * 神々モードのセッション開始
 *
 * 1. 言語存在チェック → なければ 400
 * 2. ランキングトップ 10 取得 → 自分を除外 → 候補 0 件なら 409
 * 3. 候補からランダムに 1 人選定 → 神セッション詳細 + keystroke log 取得
 * 4. 神セッション欠落 / log 取得不可なら次の候補へ（最大候補数分リトライ）
 * 5. 全候補で取得できなければ 409 Conflict
 * 6. 神セッションの problemIds から problems 本体を取得し orderIndex 順に並べる
 * 7. Redis state を save（mode=challenge_gods, ghostSessionId セット）
 *
 * Phase 4 (score-ranking) の ranking_snapshots が出来るまでは Stub が空配列を
 * 返すため、本 API は常に 409 Conflict を返す
 */
export const createChallengeGodsSession = async (
  input: CreateChallengeGodsInput,
  repo: ChallengeGodsRepo,
): Promise<Result<CreateChallengeGodsOutput>> => {
  logger.debug("PlaySessionService: Creating challenge-gods session", { ...input })

  /**
   * 1. 言語存在チェック
   */
  if (!(await repo.languageRepository.existsById(input.languageId))) {
    return err(badRequestError("Invalid language_id"))
  }

  /**
   * 2. トップ 10 取得 + 自分を除外
   */
  const top = await repo.rankingSnapshotRepository.getTopByLanguage(input.languageId, 10)
  const candidates = top.filter((t) => t.userId !== input.userId)
  if (candidates.length === 0) {
    return err(conflictError("No ghost candidates available"))
  }

  /**
   * 3-4. 候補からランダム抽選し、神セッション + keystroke log が両方取れたら確定。
   * 取れなければ次の候補にスキップ（candidates.length 回までリトライ）
   */
  const ghost = await pickUsableGhost(candidates, repo)
  if (ghost === null) {
    return err(conflictError("No usable ghost sessions"))
  }

  /**
   * 6. 問題本体取得 + orderIndex 付与
   */
  const fullProblems = await repo.problemRepository.findManyByIds(ghost.session.problemIds)
  const byId = new Map(fullProblems.map((p) => [p.id, p]))
  const orderedProblems: PlaySessionProblem[] = ghost.session.problemIds.map((pid, i) => {
    const p = byId.get(pid)
    if (!p) {
      throw new Error(`Problem ${pid} missing for ghost session ${ghost.session.id}`)
    }
    return {
      charCount: p.charCount,
      codeBlock: p.codeBlock,
      functionName: p.functionName,
      id: pid,
      lineCount: p.lineCount,
      orderIndex: i,
      sourceUrl: p.sourceUrl,
    }
  })

  /**
   * 7. Redis state を save
   */
  const sessionId = randomUUID()
  const state: PlaySessionState = {
    crawledRepoId: ghost.session.crawledRepoId,
    ghostSessionId: ghost.session.id,
    languageId: input.languageId,
    mode: "challenge_gods",
    problemIds: orderedProblems.map((p) => p.id),
    userId: input.userId,
  }
  await repo.playSessionStateRepository.save(sessionId, state, PLAY_SESSION_TTL_SECONDS)

  logger.info("PlaySessionService: challenge-gods session created", {
    ghostSessionId: ghost.session.id,
    sessionId,
    userId: input.userId,
  })

  return ok({
    ghostKeystrokeLogs: ghost.keystrokeLogs,
    ghostSessionId: ghost.session.id,
    ghostUserDisplay: {
      avatarUrl: ghost.entry.userDisplay.avatarUrl,
      bestScore: ghost.entry.bestScore,
      displayName: ghost.entry.userDisplay.displayName,
      grade: ghost.entry.userDisplay.currentGrade,
    },
    problems: orderedProblems,
    repoInfo: ghost.session.crawledRepo,
    sessionId,
  })
}

/**
 * 候補リストから「神セッション + keystroke log の両方が取れる神」を 1 人引き当てる
 */
const pickUsableGhost = async (
  candidates: RankingTopEntry[],
  repo: ChallengeGodsRepo,
): Promise<{
    entry: RankingTopEntry
    keystrokeLogs: KeystrokeLogs
    session: GhostSourceSession
} | null> => {
  const pool = [...candidates]
  while (pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length)
    const [picked] = pool.splice(i, 1)
    const session = await repo.playSessionRepository.findGhostSourceById(picked.bestPlaySessionId)
    if (!session) continue
    const keystrokeLogs = await repo.keystrokeLogRepository.findByPlaySessionId(picked.bestPlaySessionId)
    if (!keystrokeLogs) continue
    return { entry: picked, keystrokeLogs, session }
  }
  return null
}
