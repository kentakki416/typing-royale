import { randomUUID } from "node:crypto"

import { badRequestError, conflictError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { PLAY_SESSION_TTL_SECONDS, PROBLEMS_PER_SESSION } from "../const"
import { CardStorage } from "../lib/card-storage"
import { detectBonuses, totalBonusSec } from "../lib/combo-time-bonus"
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
  MonthlyRankingSnapshotRepository,
  PlaySessionProblemRepository,
  PlaySessionRepository,
  ProblemRepository,
  RankingSnapshotRepository,
  RankingTopEntry,
  RewardRepository,
  TransactionRunner,
  UserLanguageBestRepository,
  UserLifetimeStatsRepository,
  UserRepository,
} from "../repository/prisma"
import { PlaySessionStateRepository } from "../repository/redis"
import {
  FinishGrade,
  FinishResult,
  KeystrokeLogs,
  MistypeStats,
  PlaySessionProblem,
  PlaySessionState,
  RepoInfo,
} from "../types/domain"

import * as rewardsService from "./rewards-service"

// ========================================================
// 内部 pure helpers
// ========================================================

/**
 * state.problemIds の順序 (= orderIndex) で codeBlock を引ける Map を構築する。
 *
 * problemRepository.findManyByIds は順序保証がないため、orderIndex (0..19) から
 * codeBlock を引きやすい形に並べ直す。aggregateMistypeStats /
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

type PickUsableGhostRepo = {
    keystrokeLogRepository: KeystrokeLogRepository
    playSessionRepository: PlaySessionRepository
}

type UsableGhost = {
    entry: RankingTopEntry
    keystrokeLogs: KeystrokeLogs
    session: GhostSourceSession
}

/**
 * 候補リストから「神セッション + keystroke log の両方が取れる神」を 1 人引き当てる
 *
 * logged-in / guest 両方の challenge-gods 経路から呼ばれるため、依存先 Repository
 * は最小限の `PickUsableGhostRepo` だけを要求する
 */
const pickUsableGhost = async (
  candidates: RankingTopEntry[],
  repo: PickUsableGhostRepo,
): Promise<UsableGhost | null> => {
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

// ========================================================
// 内部 Result helpers (logged-in / guest 共通の実装本体)
// ========================================================

type PickSoloPlaySetRepo = {
    crawledRepoRepository: CrawledRepoRepository
    languageRepository: LanguageRepository
    problemRepository: ProblemRepository
}

type SoloPlaySet = {
    crawledRepoId: number
    orderedProblems: PlaySessionProblem[]
    repoInfo: RepoInfo
}

/**
 * 通常モード共通の問題セット抽選
 *
 * 1. 言語存在チェック → なければ 400
 * 2. eligible repo を 1 件抽選 → 無ければ 404
 * 3. その repo から 20 問抽選 → 揃わなければ 404
 * 4. orderIndex 0..19 を振り直す
 *
 * logged-in (createSoloSession) と guest (createGuestSoloSession) の両方から呼ばれる
 */
const pickSoloPlaySet = async (
  languageId: number,
  repo: PickSoloPlaySetRepo,
): Promise<Result<SoloPlaySet>> => {
  const languageExists = await repo.languageRepository.existsById(languageId)
  if (!languageExists) {
    return err(badRequestError("Invalid language_id"))
  }

  const mainRepo = await repo.crawledRepoRepository.pickRandomEligibleByLanguageId(languageId)
  if (mainRepo === null) {
    return err(notFoundError("No eligible repository for the given language"))
  }

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

  const orderedProblems: PlaySessionProblem[] = problems.map((p, i) => ({
    ...p,
    orderIndex: i,
  }))

  return ok({
    crawledRepoId: mainRepo.id,
    orderedProblems,
    repoInfo: mainRepo.repoInfo,
  })
}

type PickChallengeGodsPlaySetRepo = {
    keystrokeLogRepository: KeystrokeLogRepository
    languageRepository: LanguageRepository
    playSessionRepository: PlaySessionRepository
    problemRepository: ProblemRepository
    rankingSnapshotRepository: RankingSnapshotRepository
}

type ChallengeGodsPlaySet = {
    ghost: UsableGhost
    orderedProblems: PlaySessionProblem[]
}

/**
 * 神々モード共通の問題セット抽選
 *
 * 1. 言語存在チェック → なければ 400
 * 2. ランキングトップ 10 取得
 * 3. excludeUserId が指定されていれば候補から自分を除外
 *    （logged-in は input.userId、guest は null = 除外なし）
 * 4. 候補からランダムに 1 人選定（神セッション + keystroke log が両方取れる神）
 * 5. 神セッションの problemIds から problems 本体を取得し orderIndex 順に並べる
 *
 * logged-in (createChallengeGodsSession) と guest (createGuestChallengeGodsSession)
 * の両方から呼ばれる
 */
const pickChallengeGodsPlaySet = async (
  input: { excludeUserId: number | null; languageId: number },
  repo: PickChallengeGodsPlaySetRepo,
): Promise<Result<ChallengeGodsPlaySet>> => {
  if (!(await repo.languageRepository.existsById(input.languageId))) {
    return err(badRequestError("Invalid language_id"))
  }

  const top = await repo.rankingSnapshotRepository.getTopByLanguage(input.languageId, 10)
  const candidates = input.excludeUserId === null
    ? top
    : top.filter((t) => t.userId !== input.excludeUserId)
  if (candidates.length === 0) {
    return err(conflictError("No ghost candidates available"))
  }

  const ghost = await pickUsableGhost(candidates, repo)
  if (ghost === null) {
    return err(conflictError("No usable ghost sessions"))
  }

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

  return ok({ ghost, orderedProblems })
}

/**
 * 1 セッションの基本プレイ時間 (= クライアント側 SESSION_DURATION_MS と一致)。
 * combo マイルストーンで動的に延長される分を含めて許容 elapsed_ms 上限を算出する
 */
const BASE_SESSION_DURATION_MS = 120_000

/**
 * ネットワーク遅延・rAF tick の揺れ・finish 送信タイミングのズレを吸収するバッファ。
 * クライアントの最後の打鍵が 120_050 ms のような僅かな超過は弾かない
 */
const ELAPSED_MS_TOLERANCE_MS = 500

type ComputeServerAggregateRepo = {
    problemRepository: ProblemRepository
}

type ComputeServerAggregateInput = {
    accuracy: number
    keystrokeLogs: KeystrokeLogs
    problemIds: number[]
    typedChars: number
}

type ServerAggregate = {
    codeBlockByOrder: Map<number, string>
    mistypeStats: MistypeStats
    problemProgress: Map<number, { charsTyped: number; completed: boolean }>
    problemsCompleted: number
    problemsPlayed: number
    score: number
}

/**
 * /finish 共通のサーバー側スコア再集計
 *
 * 1. 物理限界チェック（typedChars / accuracy / log size）
 * 2. problemIds から問題本体を取得 → 件数 mismatch なら 404
 * 3. サーバーで score / mistypeStats / problemProgress を再集計
 *
 * logged-in (finishSession) は state.problemIds を Redis から取得して渡す。
 * guest (finishGuestSession) は body の problem_ids をそのまま渡す。
 */
const computeServerAggregate = async (
  input: ComputeServerAggregateInput,
  repo: ComputeServerAggregateRepo,
): Promise<Result<ServerAggregate>> => {
  if (!isWithinPhysicalLimits(input.typedChars, input.accuracy)) {
    return err(badRequestError("Out of physical limits"))
  }
  const logSize = Buffer.byteLength(JSON.stringify(input.keystrokeLogs), "utf8")
  if (logSize > MAX_KEYSTROKE_LOG_BYTES) {
    return err(badRequestError("Keystroke log too large"))
  }

  /**
   * combo マイルストーン (20 / 40 / 60 以降 20 ごと) で動的に時間ボーナスが付与される。
   * クライアントから受け取った log を時系列再生して許容 elapsed_ms 上限を算出し、
   * それを超える打鍵が混ざっていれば cheat と判定して reject する。
   * 詳細仕様: docs/spec/combo-time-bonus/README.md
   */
  const bonusEvents = detectBonuses(input.keystrokeLogs)
  const maxAllowedElapsedMs
    = BASE_SESSION_DURATION_MS + totalBonusSec(bonusEvents) * 1000 + ELAPSED_MS_TOLERANCE_MS
  const maxLogElapsedMs = input.keystrokeLogs.reduce(
    (max, e) => Math.max(max, e.elapsedMs),
    0,
  )
  if (maxLogElapsedMs > maxAllowedElapsedMs) {
    logger.warn("PlaySessionService: keystroke log exceeds allowed elapsed_ms", {
      maxAllowedElapsedMs,
      maxLogElapsedMs,
    })
    return err(badRequestError("Keystroke log exceeds allowed elapsed_ms"))
  }

  const problems = await repo.problemRepository.findManyByIds(input.problemIds)
  if (problems.length !== input.problemIds.length) {
    logger.warn("PlaySessionService: Problem set mismatch", {
      expected: input.problemIds.length,
      found: problems.length,
    })
    return err(notFoundError("Problem set mismatch"))
  }
  const codeBlockByOrder = buildCodeBlockByOrder(input.problemIds, problems)

  const score = computeScore(input.typedChars, input.accuracy)
  const mistypeStats = aggregateMistypeStats(input.keystrokeLogs, codeBlockByOrder)
  const problemProgress = aggregateProblemProgress(input.keystrokeLogs, codeBlockByOrder)
  const problemsCompleted = [...problemProgress.values()].filter((v) => v.completed).length
  const problemsPlayed = new Set(input.keystrokeLogs.map((e) => e.problemIndex)).size

  return ok({
    codeBlockByOrder,
    mistypeStats,
    problemProgress,
    problemsCompleted,
    problemsPlayed,
    score,
  })
}

type PersistFinishedSessionInput = {
    accuracy: number
    keystrokeLogs: KeystrokeLogs
    mistypeStats: MistypeStats
    playedAt: Date
    problemProgress: Map<number, { charsTyped: number; completed: boolean }>
    problemsCompleted: number
    problemsPlayed: number
    score: number
    state: PlaySessionState
    typedChars: number
}

type PersistFinishedSessionResult = {
    bestScoreUpdated: boolean
    gradeUp: { from: FinishGrade; to: FinishGrade } | null
}

/**
 * 5 テーブル (play_sessions / play_session_problems / keystroke_logs /
 * user_lifetime_stats / user_language_best) を 1 transaction でアトミックに
 * 書き込む（logged-in 専用）。
 *
 * 戻り値:
 * - bestScoreUpdated: 言語別ベストが更新されたか
 * - gradeUp: 全言語通算 bestScore のグレードレベルが上がった場合のみ from/to を返す
 */
const persistFinishedSessionAtomic = async (
  data: PersistFinishedSessionInput,
  repo: FinishSessionRepo,
): Promise<PersistFinishedSessionResult> => {
  return repo.transactionRunner.run(async (tx) => {
    const session = await repo.playSessionRepository.create(
      {
        accuracy: data.accuracy,
        crawledRepoId: data.state.crawledRepoId,
        ghostSessionId: data.state.ghostSessionId,
        languageId: data.state.languageId,
        mistypeStats: data.mistypeStats,
        mode: data.state.mode,
        playedAt: data.playedAt,
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

    const statsResult = await repo.userLifetimeStatsRepository.upsertOnFinish(
      {
        languageId: data.state.languageId,
        mistypeStats: data.mistypeStats,
        score: data.score,
        typedChars: data.typedChars,
        userId: data.state.userId,
      },
      tx,
    )

    const bestResult = await repo.userLanguageBestRepository.upsertIfBest(
      {
        accuracy: data.accuracy,
        bestPlaySessionId: session.id,
        languageId: data.state.languageId,
        playedAt: data.playedAt,
        score: data.score,
        typedChars: data.typedChars,
        userId: data.state.userId,
      },
      tx,
    )

    return { bestScoreUpdated: bestResult.updated, gradeUp: statsResult.gradeUp }
  })
}

// ========================================================
// 公開 Service: 通常モード セッション開始
// ========================================================

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
 * 通常モードのプレイセッション開始（認証必須）
 *
 * 1. `pickSoloPlaySet` で問題セットを抽選（言語チェック + repo + 20問 + orderIndex）
 * 2. Redis にステート保存（TTL 300 秒）+ sessionId を発行して返す
 */
export const createSoloSession = async (
  input: CreateSoloSessionInput,
  repo: SoloSessionRepo,
): Promise<Result<CreateSoloSessionOutput>> => {
  logger.debug("PlaySessionService: Creating solo session", { ...input })

  const playSet = await pickSoloPlaySet(input.languageId, repo)
  if (!playSet.ok) return playSet
  const { crawledRepoId, orderedProblems, repoInfo } = playSet.value

  const sessionId = randomUUID()
  const state: PlaySessionState = {
    crawledRepoId,
    ghostSessionId: null,
    languageId: input.languageId,
    mode: "solo",
    problemIds: orderedProblems.map((p) => p.id),
    userId: input.userId,
  }
  await repo.playSessionStateRepository.save(sessionId, state, PLAY_SESSION_TTL_SECONDS)

  logger.debug("PlaySessionService: Solo session created", {
    crawledRepoId,
    problemCount: orderedProblems.length,
    sessionId,
  })

  return ok({ problems: orderedProblems, repoInfo, sessionId })
}

// ========================================================
// 公開 Service: 神々モード セッション開始
// ========================================================

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

type GhostUserDisplay = {
    avatarUrl: string | null
    bestScore: number
    displayName: string
    grade: string
}

export type CreateChallengeGodsOutput = {
    ghostKeystrokeLogs: KeystrokeLogs
    ghostSessionId: number
    ghostUserDisplay: GhostUserDisplay
    problems: PlaySessionProblem[]
    repoInfo: RepoInfo
    sessionId: string
}

/**
 * 神セッション情報をレスポンス用に整形（logged-in / guest 共通）
 */
const formatGhostForResponse = (
  ghost: UsableGhost,
  orderedProblems: PlaySessionProblem[],
): {
    ghostKeystrokeLogs: KeystrokeLogs
    ghostSessionId: number
    ghostUserDisplay: GhostUserDisplay
    problems: PlaySessionProblem[]
    repoInfo: RepoInfo
} => ({
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
})

/**
 * 神々モードのプレイセッション開始（認証必須）
 *
 * 1. `pickChallengeGodsPlaySet` で問題セットを抽選（excludeUserId=自分 でランキングから除外）
 * 2. Redis にステート保存（mode=challenge_gods, ghostSessionId セット）+ sessionId を返す
 */
export const createChallengeGodsSession = async (
  input: CreateChallengeGodsInput,
  repo: ChallengeGodsRepo,
): Promise<Result<CreateChallengeGodsOutput>> => {
  logger.debug("PlaySessionService: Creating challenge-gods session", { ...input })

  const playSet = await pickChallengeGodsPlaySet(
    { excludeUserId: input.userId, languageId: input.languageId },
    repo,
  )
  if (!playSet.ok) return playSet
  const { ghost, orderedProblems } = playSet.value

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

  return ok({ ...formatGhostForResponse(ghost, orderedProblems), sessionId })
}

// ========================================================
// 公開 Service: /finish (logged-in)
// ========================================================

type FinishSessionRepo = {
    cardStorage: CardStorage
    keystrokeLogRepository: KeystrokeLogRepository
    monthlyRankingSnapshotRepository: MonthlyRankingSnapshotRepository
    playSessionProblemRepository: PlaySessionProblemRepository
    playSessionRepository: PlaySessionRepository
    playSessionStateRepository: PlaySessionStateRepository
    problemRepository: ProblemRepository
    rewardRepository: RewardRepository
    transactionRunner: TransactionRunner
    userLanguageBestRepository: UserLanguageBestRepository
    userLifetimeStatsRepository: UserLifetimeStatsRepository
    userRepository: UserRepository
}

const MONTHLY_TOP_TEN_CAP = 10

/**
 * 与えられた時刻が属する JST 暦月を "YYYY-MM" 形式で返す純関数。
 * monthly_ranking_snapshots.year_month に書き込む唯一のヘルパ
 */
const currentYearMonthJst = (now: Date): string => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}`
}

export type FinishSessionInput = {
    accuracy: number
    keystrokeLogs: KeystrokeLogs
    sessionId: string
    typedChars: number
}

/**
 * タイピングセッションのスコア集計とアトミック DB 書き込み（認証必須）
 *
 * 1. Redis から PlaySessionState を取得（無ければ 404）
 * 2. `computeServerAggregate` で物理限界チェック + サーバー側スコア再集計
 * 3. 5 テーブルを 1 transaction で書き込み + Redis state 削除
 * 4. ランキング系の追加クエリ（new_rank / top_ten_boundary_score）
 * 5. グレードアップしていれば達成カード PNG を生成（rewards）
 *
 * ゲスト（未ログイン）は本関数を通らず `finishGuestSession` 経由でステートレスに処理する
 */
export const finishSession = async (
  input: FinishSessionInput,
  repo: FinishSessionRepo,
): Promise<Result<FinishResult>> => {
  logger.debug("PlaySessionService: Finishing session", { sessionId: input.sessionId })

  const state = await repo.playSessionStateRepository.findById(input.sessionId)
  if (state === null) {
    return err(notFoundError("Play session not found or expired"))
  }

  const agg = await computeServerAggregate(
    {
      accuracy: input.accuracy,
      keystrokeLogs: input.keystrokeLogs,
      problemIds: state.problemIds,
      typedChars: input.typedChars,
    },
    repo,
  )
  if (!agg.ok) return agg
  const { mistypeStats, problemProgress, problemsCompleted, problemsPlayed, score } = agg.value

  const playedAt = new Date()
  const { bestScoreUpdated, gradeUp } = await persistFinishedSessionAtomic(
    {
      accuracy: input.accuracy,
      keystrokeLogs: input.keystrokeLogs,
      mistypeStats,
      playedAt,
      problemProgress,
      problemsCompleted,
      problemsPlayed,
      score,
      state,
      typedChars: input.typedChars,
    },
    repo,
  )

  await repo.playSessionStateRepository.delete(input.sessionId)

  /**
   * ランキング系の追加クエリ（トランザクション後）
   * - 自分の最新ベスト + 自分より上位の数 → new_rank
   * - 10 位スコア（10 件未満なら null）
   * - 当該言語のランクイン総人数（リザルト画面「Y 人中」表示用）
   */
  const updatedBest = await repo.userLanguageBestRepository.findMine(
    state.userId,
    state.languageId,
  )
  const newRank = updatedBest === null
    ? null
    : (await repo.userLanguageBestRepository.countHigherRanked(state.languageId, updatedBest)) + 1
  const topTenBoundaryScore = await repo.userLanguageBestRepository.findTenthScore(state.languageId)
  const totalRankedPlayers = await repo.userLanguageBestRepository.countRankableByLanguage(state.languageId)

  /**
   * 月間 TOP 10 snapshot の同期 UPSERT + cap 維持
   * - 入賞条件: snapshot 件数 < cap OR 今回スコアが現 boundary 以上
   * - 入賞時に自分の行を upsert し、件数が cap を超えていれば自分以外の最下位を 1 件 delete
   * - 入賞しない場合は snapshot を一切触らない
   * - 自分の当月過去ベストとの比較は snapshot.upsert の `update` で「上書き」される。
   *   過去ベストの方が高い場合は今回スコアが boundary 未満になり、自然に入賞しない
   * - 詳細: docs/spec/result-top-ten-popup/step1-api-finish-monthly-extension.md
   */
  const yearMonth = currentYearMonthJst(playedAt)
  const beforeCount = await repo.monthlyRankingSnapshotRepository.countByLanguage(
    yearMonth,
    state.languageId,
  )
  const beforeBoundary = beforeCount < MONTHLY_TOP_TEN_CAP
    ? null
    : await repo.monthlyRankingSnapshotRepository.findBoundaryScore(
      yearMonth,
      state.languageId,
      MONTHLY_TOP_TEN_CAP,
    )
  const isMonthlyTopTenEntry = beforeCount < MONTHLY_TOP_TEN_CAP
    || score >= (beforeBoundary ?? 0)

  if (isMonthlyTopTenEntry) {
    await repo.monthlyRankingSnapshotRepository.upsertForUser({
      accuracy: input.accuracy,
      languageId: state.languageId,
      playedAt,
      score,
      userId: state.userId,
      yearMonth,
    })
    const afterCount = await repo.monthlyRankingSnapshotRepository.countByLanguage(
      yearMonth,
      state.languageId,
    )
    if (afterCount > MONTHLY_TOP_TEN_CAP) {
      await repo.monthlyRankingSnapshotRepository.deleteLowestExcluding(
        yearMonth,
        state.languageId,
        state.userId,
      )
    }
  }
  const monthlyTopTenBoundaryScore = await repo.monthlyRankingSnapshotRepository.findBoundaryScore(
    yearMonth,
    state.languageId,
    MONTHLY_TOP_TEN_CAP,
  )

  /**
   * グレードアップが発生していれば達成カード PNG を自動生成 (rewards step6)
   * 失敗しても /finish 全体は成功扱い: rewards 行は assetUrl=null で残り、
   * マイページから再生成リクエストが可能
   */
  if (gradeUp !== null) {
    try {
      await rewardsService.createCard(
        {
          payload: { grade_slug: gradeUp.to.slug },
          type: "grade_up",
          userId: state.userId,
        },
        {
          cardStorage: repo.cardStorage,
          rewardRepository: repo.rewardRepository,
          userLifetimeStatsRepository: repo.userLifetimeStatsRepository,
          userRepository: repo.userRepository,
        },
      )
    } catch (err) {
      logger.warn("PlaySessionService: achievement card generation failed", {
        error: err instanceof Error ? err.message : String(err),
        gradeSlug: gradeUp.to.slug,
        userId: state.userId,
      })
    }
  }

  logger.info("PlaySessionService: Session finished", {
    bestScoreUpdated,
    newRank,
    score,
    sessionId: input.sessionId,
    userId: state.userId,
  })

  return ok({
    accuracy: input.accuracy,
    bestScoreUpdated,
    gradeUp: gradeUp === null
      ? null
      : {
        from: { level: gradeUp.from.level, name: gradeUp.from.name, slug: gradeUp.from.slug },
        to: { level: gradeUp.to.level, name: gradeUp.to.name, slug: gradeUp.to.slug },
      },
    mistypeStats,
    monthlyTopTenBoundaryScore,
    newRank,
    persisted: true,
    problemsCompleted,
    problemsPlayed,
    score,
    topTenBoundaryScore,
    totalRankedPlayers,
    typedChars: input.typedChars,
  })
}

// ========================================================
// 公開 Service: ゲスト用（ステートレス）
// ========================================================

type GuestSoloSessionRepo = {
    crawledRepoRepository: CrawledRepoRepository
    languageRepository: LanguageRepository
    problemRepository: ProblemRepository
}

export type CreateGuestSoloSessionInput = {
    languageId: number
}

export type CreateGuestSoloSessionOutput = {
    problems: PlaySessionProblem[]
    repoInfo: RepoInfo
}

/**
 * ゲスト用通常モードのセッション開始（ステートレス）
 *
 * 認証必須版 `createSoloSession` との違い:
 * - Redis に PlaySessionState を保存しない (sessionId も発行しない)
 * - userId 引数なし
 *
 * 問題セット抽選自体は `pickSoloPlaySet` を共有
 */
export const createGuestSoloSession = async (
  input: CreateGuestSoloSessionInput,
  repo: GuestSoloSessionRepo,
): Promise<Result<CreateGuestSoloSessionOutput>> => {
  logger.debug("PlaySessionService: Creating guest solo session", { ...input })

  const playSet = await pickSoloPlaySet(input.languageId, repo)
  if (!playSet.ok) return playSet

  return ok({
    problems: playSet.value.orderedProblems,
    repoInfo: playSet.value.repoInfo,
  })
}

type GuestChallengeGodsRepo = {
    keystrokeLogRepository: KeystrokeLogRepository
    languageRepository: LanguageRepository
    playSessionRepository: PlaySessionRepository
    problemRepository: ProblemRepository
    rankingSnapshotRepository: RankingSnapshotRepository
}

export type CreateGuestChallengeGodsInput = {
    languageId: number
}

export type CreateGuestChallengeGodsOutput = {
    ghostKeystrokeLogs: KeystrokeLogs
    ghostSessionId: number
    ghostUserDisplay: GhostUserDisplay
    problems: PlaySessionProblem[]
    repoInfo: RepoInfo
}

/**
 * ゲスト用神々モードのセッション開始（ステートレス）
 *
 * 認証必須版 `createChallengeGodsSession` との違い:
 * - Redis に PlaySessionState を保存しない (sessionId も発行しない)
 * - 候補から自分を除外する処理がない（excludeUserId = null）
 *
 * 問題セット抽選自体は `pickChallengeGodsPlaySet` を共有
 */
export const createGuestChallengeGodsSession = async (
  input: CreateGuestChallengeGodsInput,
  repo: GuestChallengeGodsRepo,
): Promise<Result<CreateGuestChallengeGodsOutput>> => {
  logger.debug("PlaySessionService: Creating guest challenge-gods session", { ...input })

  const playSet = await pickChallengeGodsPlaySet(
    { excludeUserId: null, languageId: input.languageId },
    repo,
  )
  if (!playSet.ok) return playSet

  logger.info("PlaySessionService: guest challenge-gods session created", {
    ghostSessionId: playSet.value.ghost.session.id,
  })

  return ok(formatGhostForResponse(playSet.value.ghost, playSet.value.orderedProblems))
}

type GuestFinishSessionRepo = {
    problemRepository: ProblemRepository
    userLanguageBestRepository: UserLanguageBestRepository
}

export type FinishGuestSessionInput = {
    accuracy: number
    keystrokeLogs: KeystrokeLogs
    problemIds: number[]
    typedChars: number
}

export type FinishGuestSessionOutput = {
    accuracy: number
    mistypeStats: MistypeStats
    newRank: number | null
    problemsCompleted: number
    problemsPlayed: number
    score: number
    totalRankedPlayers: number
    typedChars: number
}

/**
 * ゲスト用 /finish（ステートレス）
 *
 * 認証必須版 `finishSession` との違い:
 * - Redis state を見ない（クライアントから `problemIds` を直接受け取る）
 * - DB 書き込み・ランキング更新・rewards 生成は一切行わない
 *
 * サーバー再集計自体は `computeServerAggregate` を共有
 * （物理限界チェックも共有されるため、不正シェアスコアの防止が効く）
 */
export const finishGuestSession = async (
  input: FinishGuestSessionInput,
  repo: GuestFinishSessionRepo,
): Promise<Result<FinishGuestSessionOutput>> => {
  logger.debug("PlaySessionService: Finishing guest session")

  const agg = await computeServerAggregate(input, repo)
  if (!agg.ok) return agg

  /**
   * ゲストは DB に保存しないが、その時点での「もしランキング登録していたら何位か」
   * を知れた方が UX が良いので、出題セットの言語に対する仮想 rank を算出して返す。
   * 言語は出題された problems から派生（複数言語にまたがる構成は無いため先頭でよい）
   */
  const problems = await repo.problemRepository.findManyByIds(input.problemIds)
  const languageId = problems[0]?.languageId ?? null
  let newRank: number | null = null
  let totalRankedPlayers = 0
  if (languageId !== null) {
    totalRankedPlayers = await repo.userLanguageBestRepository.countRankableByLanguage(languageId)
    const synthetic = {
      accuracy: input.accuracy,
      bestPlaySessionId: 0,
      playedAt: new Date(),
      score: agg.value.score,
      typedChars: input.typedChars,
    }
    const higher = await repo.userLanguageBestRepository.countHigherRanked(languageId, synthetic)
    newRank = higher + 1
  }

  logger.info("PlaySessionService: Guest session finished (stateless)", {
    languageId,
    newRank,
    score: agg.value.score,
  })

  return ok({
    accuracy: input.accuracy,
    mistypeStats: agg.value.mistypeStats,
    newRank,
    problemsCompleted: agg.value.problemsCompleted,
    problemsPlayed: agg.value.problemsPlayed,
    score: agg.value.score,
    totalRankedPlayers,
    typedChars: input.typedChars,
  })
}
