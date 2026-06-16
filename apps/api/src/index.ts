import cors from "cors"
import express from "express"

import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"
import { createRedisClient } from "@repo/redis"

import { GithubOAuthClient } from "./client/github-oauth"
import { GoogleOAuthClient } from "./client/google-oauth"
import { AuthDevLoginController } from "./controller/auth/dev-login"
import { AuthGithubController } from "./controller/auth/github"
import { AuthGoogleController } from "./controller/auth/google"
import { AuthLogoutController } from "./controller/auth/logout"
import { AuthRefreshController } from "./controller/auth/refresh"
import { BadgeConfigGetController } from "./controller/badge/config-get"
import { BadgeConfigUpdateController } from "./controller/badge/config-update"
import { BadgeSvgController } from "./controller/badge/svg"
import { HallOfFameCommentCreateController } from "./controller/hall-of-fame/comment-create"
import { HallOfFameCommentUpdateController } from "./controller/hall-of-fame/comment-update"
import { HallOfFameListController } from "./controller/hall-of-fame/list"
import { HealthLivenessController } from "./controller/health/liveness"
import { HealthReadinessController } from "./controller/health/readiness"
import { MemoCreateController } from "./controller/memo/create"
import { MemoDeleteController } from "./controller/memo/delete"
import { MemoDetailController } from "./controller/memo/detail"
import { MemoListController } from "./controller/memo/list"
import { MemoUpdateController } from "./controller/memo/update"
import { PlaySessionFinishController } from "./controller/play-session/finish"
import { PlaySessionGuestFinishController } from "./controller/play-session/guest-finish"
import { PlaySessionGuestStartChallengeGodsController } from "./controller/play-session/guest-start-challenge-gods"
import { PlaySessionGuestStartSoloController } from "./controller/play-session/guest-start-solo"
import { PlaySessionStartChallengeGodsController } from "./controller/play-session/start-challenge-gods"
import { PlaySessionStartSoloController } from "./controller/play-session/start-solo"
import { PlayerDetailController } from "./controller/player/detail"
import { RankingListController } from "./controller/ranking/list"
import { RankingMeController } from "./controller/ranking/me"
import { RankingMonthlyListController } from "./controller/ranking/monthly-list"
import { ReplayFeaturedController } from "./controller/replay/featured"
import { ReplayGetController } from "./controller/replay/get"
import { RewardsCardCreateController } from "./controller/rewards/cards"
import { RewardsListMeController } from "./controller/rewards/me"
import { UserDeleteController } from "./controller/user/delete"
import { UserGetController } from "./controller/user/get"
import { UserUpdateController } from "./controller/user/update"
import { env } from "./env"
import { LocalCardStorage } from "./lib/card-storage"
import { authMiddleware } from "./middleware/auth"
import { requestLogger } from "./middleware/request-logger"
import { unhandledExceptionHandler } from "./middleware/unhandled-exception-handler"
import {
  PrismaAuthAccountRepository,
  PrismaBadgeConfigRepository,
  PrismaCrawledRepoRepository,
  PrismaDatabaseHealthRepository,
  PrismaHallOfFameEntryRepository,
  PrismaKeystrokeLogRepository,
  PrismaLanguageRepository,
  PrismaMemoRepository,
  PrismaMonthlyRankingSnapshotRepository,
  PrismaPlaySessionProblemRepository,
  PrismaPlaySessionRepository,
  PrismaProblemRepository,
  PrismaRankingSnapshotRepository,
  PrismaReplayRepository,
  PrismaRewardRepository,
  PrismaTransactionRunner,
  PrismaUserLanguageBestRepository,
  PrismaUserLifetimeStatsRepository,
  PrismaUserRepository,
} from "./repository/prisma"
import { IoRedisHealthRepository, IoRedisPlaySessionStateRepository, IoRedisRefreshTokenRepository } from "./repository/redis"
import { authRouter } from "./routes/auth-router"
import { badgeRouter } from "./routes/badge-router"
import { hallOfFameRouter } from "./routes/hall-of-fame-router"
import { healthRouter } from "./routes/health-router"
import { memoRouter } from "./routes/memo-router"
import { playSessionRouter } from "./routes/play-session-router"
import { playerRouter } from "./routes/player-router"
import { rankingRouter } from "./routes/ranking-router"
import { replayRouter } from "./routes/replay-router"
import { rewardsRouter } from "./routes/rewards-router"
import { userRouter } from "./routes/user-router"

/**
 * インフラ client の生成 (プロセス起動時に 1 回だけ)
 * - createPrismaClient: DATABASE_URL / DATABASE_REPLICA_URL を読んで PrismaClient を生成
 * - createRedisClient: REDIS_URL を最優先で読んで Redis を生成
 */
const prisma = createPrismaClient()
const redis = createRedisClient()

/**
 * Repository の DI assembly
 */
const userRepository = new PrismaUserRepository(prisma)
const authAccountRepository = new PrismaAuthAccountRepository(prisma)
const transactionRunner = new PrismaTransactionRunner(prisma)
const memoRepository = new PrismaMemoRepository(prisma)
const databaseHealthRepository = new PrismaDatabaseHealthRepository(prisma)
const redisHealthRepository = new IoRedisHealthRepository(redis)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(redis)
const languageRepository = new PrismaLanguageRepository(prisma)
const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
const problemRepository = new PrismaProblemRepository(prisma)
const playSessionRepository = new PrismaPlaySessionRepository(prisma)
const playSessionProblemRepository = new PrismaPlaySessionProblemRepository(prisma)
const keystrokeLogRepository = new PrismaKeystrokeLogRepository(prisma)
const userLifetimeStatsRepository = new PrismaUserLifetimeStatsRepository(prisma)
const userLanguageBestRepository = new PrismaUserLanguageBestRepository(prisma)
const monthlyRankingSnapshotRepository = new PrismaMonthlyRankingSnapshotRepository(prisma)
const badgeConfigRepository = new PrismaBadgeConfigRepository(prisma)
const hallOfFameEntryRepository = new PrismaHallOfFameEntryRepository(prisma)
const rewardRepository = new PrismaRewardRepository(prisma)
const replayRepository = new PrismaReplayRepository(prisma)
const playSessionStateRepository = new IoRedisPlaySessionStateRepository(redis)

/**
 * 達成カード PNG ストレージ (MVP: local filesystem)
 */
const cardStorage = new LocalCardStorage(env.REWARDS_CACHE_DIR, env.REWARDS_PUBLIC_URL_PREFIX)
/**
 * `user_language_best` を source とするリアルタイム集計実装
 * （score-ranking step2 で StubRankingSnapshotRepository から差し替え。
 * TOP 10 が 1 件でも存在すれば /challenge-gods が成功するようになる）
 */
const rankingSnapshotRepository = new PrismaRankingSnapshotRepository(prisma)

/**
 * 外部 SaaS client の DI assembly
 */
const googleOAuthClient = new GoogleOAuthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
const githubOAuthClient = new GithubOAuthClient(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET)

/**
 * Health Controller のインスタンス化
 */
const healthLivenessController = new HealthLivenessController()
const healthReadinessController = new HealthReadinessController(databaseHealthRepository, redisHealthRepository)

/**
 * Auth Controller のインスタンス化
 */
const authGoogleController = new AuthGoogleController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
  googleOAuthClient,
)
const authGithubController = new AuthGithubController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
  githubOAuthClient,
)
const authRefreshController = new AuthRefreshController(refreshTokenRepository)
const authLogoutController = new AuthLogoutController(refreshTokenRepository)

/**
 * User Controller のインスタンス化（認証中ユーザー自身の取得・更新・削除）
 */
const userGetController = new UserGetController(userRepository)
const userUpdateController = new UserUpdateController(userRepository)
const userDeleteController = new UserDeleteController(userRepository, refreshTokenRepository)

/**
 * dev-login Controller は production 以外でのみ生成する
 * （本番では auth-router でルート自体が登録されない）
 */
const authDevLoginController = process.env.NODE_ENV !== "production"
  ? new AuthDevLoginController(userRepository, refreshTokenRepository)
  : undefined

/**
 * Memo Controller のインスタンス化
 */
const memoListController = new MemoListController(memoRepository)
const memoDetailController = new MemoDetailController(memoRepository)
const memoCreateController = new MemoCreateController(memoRepository)
const memoUpdateController = new MemoUpdateController(memoRepository)
const memoDeleteController = new MemoDeleteController(memoRepository)

/**
 * PlaySession Controller のインスタンス化
 */
const playSessionStartSoloController = new PlaySessionStartSoloController(
  crawledRepoRepository,
  languageRepository,
  playSessionStateRepository,
  problemRepository,
)
const playSessionFinishController = new PlaySessionFinishController(
  cardStorage,
  keystrokeLogRepository,
  playSessionProblemRepository,
  playSessionRepository,
  playSessionStateRepository,
  problemRepository,
  rewardRepository,
  transactionRunner,
  userLanguageBestRepository,
  userLifetimeStatsRepository,
  userRepository,
)
const playSessionStartChallengeGodsController = new PlaySessionStartChallengeGodsController(
  keystrokeLogRepository,
  languageRepository,
  playSessionRepository,
  playSessionStateRepository,
  problemRepository,
  rankingSnapshotRepository,
)
const playSessionGuestStartSoloController = new PlaySessionGuestStartSoloController(
  crawledRepoRepository,
  languageRepository,
  problemRepository,
)
const playSessionGuestStartChallengeGodsController = new PlaySessionGuestStartChallengeGodsController(
  keystrokeLogRepository,
  languageRepository,
  playSessionRepository,
  problemRepository,
  rankingSnapshotRepository,
)
const playSessionGuestFinishController = new PlaySessionGuestFinishController(
  problemRepository,
  userLanguageBestRepository,
)

/**
 * Ranking Controller のインスタンス化
 */
const rankingListController = new RankingListController(
  languageRepository,
  userLanguageBestRepository,
)
const rankingMeController = new RankingMeController(
  languageRepository,
  userLanguageBestRepository,
  userLifetimeStatsRepository,
)
const rankingMonthlyListController = new RankingMonthlyListController(
  languageRepository,
  monthlyRankingSnapshotRepository,
)

/**
 * Player Controller のインスタンス化
 */
const playerDetailController = new PlayerDetailController(
  userLanguageBestRepository,
  userLifetimeStatsRepository,
  userRepository,
)

/**
 * Badge Controller のインスタンス化
 */
const badgeSvgController = new BadgeSvgController(
  badgeConfigRepository,
  languageRepository,
  userLanguageBestRepository,
  userLifetimeStatsRepository,
  userRepository,
)
const badgeConfigGetController = new BadgeConfigGetController(badgeConfigRepository)
const badgeConfigUpdateController = new BadgeConfigUpdateController(badgeConfigRepository)

/**
 * Hall of Fame Controller のインスタンス化
 */
const hallOfFameListController = new HallOfFameListController(
  hallOfFameEntryRepository,
  languageRepository,
  userLanguageBestRepository,
)
const hallOfFameCommentCreateController = new HallOfFameCommentCreateController(
  hallOfFameEntryRepository,
  languageRepository,
  userLanguageBestRepository,
)
const hallOfFameCommentUpdateController = new HallOfFameCommentUpdateController(
  hallOfFameEntryRepository,
  languageRepository,
)

/**
 * Rewards Controller のインスタンス化
 */
const rewardsCardCreateController = new RewardsCardCreateController(
  cardStorage,
  rewardRepository,
  userLifetimeStatsRepository,
  userRepository,
)
const rewardsListMeController = new RewardsListMeController(rewardRepository)

/**
 * Replay Controller のインスタンス化
 */
const replayGetController = new ReplayGetController(keystrokeLogRepository, replayRepository)
const replayFeaturedController = new ReplayFeaturedController(replayRepository)

const app = express()

/**
 * cors設定のミドルウェア
 */
app.use(
  cors({
    credentials: true,
    origin: env.FRONTEND_URL,
  })
)

/**
 * jsonを変換するミドルウェア
 */
app.use(express.json())

/**
 * 認証ミドルウェア
 */
app.use(authMiddleware)

/**
 * リクエストのロギングミドルウェア
 */
app.use(requestLogger)

/**
 * ルーティング
 */
app.use(
  "/api/health",
  healthRouter({
    liveness: healthLivenessController,
    readiness: healthReadinessController,
  })
)
app.use(
  "/api/auth",
  authRouter({
    devLogin: authDevLoginController,
    github: authGithubController,
    google: authGoogleController,
    logout: authLogoutController,
    refresh: authRefreshController,
  })
)
app.use(
  "/api/user",
  userRouter({
    badgeConfigGet: badgeConfigGetController,
    badgeConfigUpdate: badgeConfigUpdateController,
    delete: userDeleteController,
    get: userGetController,
    update: userUpdateController,
  })
)
app.use(
  "/badge",
  badgeRouter({
    svg: badgeSvgController,
  })
)
app.use(
  "/api/hall-of-fame",
  hallOfFameRouter({
    commentCreate: hallOfFameCommentCreateController,
    commentUpdate: hallOfFameCommentUpdateController,
    list: hallOfFameListController,
  })
)
app.use(
  "/api/rewards",
  rewardsRouter({
    cards: rewardsCardCreateController,
    me: rewardsListMeController,
  })
)

/**
 * 達成カード PNG の静的配信
 * (REWARDS_PUBLIC_URL_PREFIX 直下 = REWARDS_CACHE_DIR)
 */
app.use(env.REWARDS_PUBLIC_URL_PREFIX, express.static(env.REWARDS_CACHE_DIR))
app.use(
  "/api/memo",
  memoRouter({
    create: memoCreateController,
    delete: memoDeleteController,
    detail: memoDetailController,
    list: memoListController,
    update: memoUpdateController,
  })
)
app.use(
  "/api/play-sessions",
  playSessionRouter({
    finish: playSessionFinishController,
    guestFinish: playSessionGuestFinishController,
    guestStartChallengeGods: playSessionGuestStartChallengeGodsController,
    guestStartSolo: playSessionGuestStartSoloController,
    startChallengeGods: playSessionStartChallengeGodsController,
    startSolo: playSessionStartSoloController,
  })
)
app.use(
  "/api/rankings",
  rankingRouter({
    list: rankingListController,
    me: rankingMeController,
    monthlyList: rankingMonthlyListController,
  })
)
app.use(
  "/api/replays",
  replayRouter({
    featured: replayFeaturedController,
    get: replayGetController,
  })
)
app.use(
  "/api/players",
  playerRouter({
    detail: playerDetailController,
  })
)

/**
 * 想定外例外を捕捉する Express の最終エラーハンドラ
 * 業務 4xx エラーは Controller の sendError 経由で返却されるため、ここを通らない
 * ルーティング定義の最後に登録する必要がある
 */
app.use(unhandledExceptionHandler)

/**
 * サーバー起動
 */
const server = app.listen(env.PORT, () => {
  logger.info("API server running", {
    environment: env.NODE_ENV,
    port: env.PORT,
    url: `http://localhost:${env.PORT}`,
  })
})

/**
 * Graceful shutdown
 * SIGTERM / SIGINT を受けたら HTTP server を閉じてから DB / Redis を切断
 */
const shutdown = async (signal: string): Promise<void> => {
  logger.info("Shutdown initiated", { signal })
  server.close(async () => {
    await Promise.all([
      prisma.$disconnect(),
      redis.quit(),
    ])
    logger.info("Shutdown completed")
    process.exit(0)
  })
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

/**
 * 予期しない例外をキャッチ（念のため）
 */
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  logger.error("Unhandled rejection", error)
  process.exit(1)
})
