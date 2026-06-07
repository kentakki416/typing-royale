import { PrismaClient } from "@repo/db"

/**
 * ランキング表示用エントリ（TOP N 用、ユーザー情報を含む）
 */
export type UserLanguageBestWithUser = {
    accuracy: number
    bestPlaySessionId: number
    playedAt: Date
    score: number
    typedChars: number
    user: {
        avatarUrl: string | null
        currentGrade: string
        displayName: string
        id: number
    }
}

/**
 * 自分のベスト 1 件（順位計算用、ユーザー情報は呼び出し側で取得済み）
 */
export type MyLanguageBest = {
    accuracy: number
    bestPlaySessionId: number
    playedAt: Date
    score: number
    typedChars: number
}

/**
 * UserLanguageBest リポジトリのインターフェース
 *
 * `user_language_best` を source としてリアルタイム集計でランキングを返す。
 * docs/spec/score-ranking/README.md「リアルタイム集計（バッチ不要）」参照
 */
export interface UserLanguageBestRepository {
    countHigherRanked(languageId: number, myBest: MyLanguageBest): Promise<number>
    countRankableByLanguage(languageId: number): Promise<number>
    findMine(userId: number, languageId: number): Promise<MyLanguageBest | null>
    findTopByLanguage(languageId: number, limit: number): Promise<UserLanguageBestWithUser[]>
}

/**
 * Prisma 実装の UserLanguageBest リポジトリ
 */
export class PrismaUserLanguageBestRepository implements UserLanguageBestRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findTopByLanguage(
    languageId: number,
    limit: number,
  ): Promise<UserLanguageBestWithUser[]> {
    const rows = await this._prisma.userLanguageBest.findMany({
      include: {
        user: {
          include: { lifetimeStats: { select: { currentGrade: true } } },
        },
      },
      orderBy: [
        { score: "desc" },
        { accuracy: "desc" },
        { playedAt: "asc" },
      ],
      take: limit,
      where: {
        languageId,
        user: { canPublicRanking: true },
      },
    })

    return rows.map((row) => ({
      accuracy: row.accuracy,
      bestPlaySessionId: row.bestPlaySessionId,
      playedAt: row.playedAt,
      score: row.score,
      typedChars: row.typedChars,
      user: {
        avatarUrl: row.user.avatarUrl,
        currentGrade: row.user.lifetimeStats?.currentGrade ?? "intern",
        displayName: row.user.displayName ?? `user${row.user.id}`,
        id: row.user.id,
      },
    }))
  }

  async findMine(userId: number, languageId: number): Promise<MyLanguageBest | null> {
    const row = await this._prisma.userLanguageBest.findUnique({
      where: { userId_languageId: { languageId, userId } },
    })
    if (row === null) return null
    return {
      accuracy: row.accuracy,
      bestPlaySessionId: row.bestPlaySessionId,
      playedAt: row.playedAt,
      score: row.score,
      typedChars: row.typedChars,
    }
  }

  async countHigherRanked(languageId: number, myBest: MyLanguageBest): Promise<number> {
    return this._prisma.userLanguageBest.count({
      where: {
        languageId,
        user: { canPublicRanking: true },
        OR: [
          { score: { gt: myBest.score } },
          { score: myBest.score, accuracy: { gt: myBest.accuracy } },
          {
            accuracy: myBest.accuracy,
            playedAt: { lt: myBest.playedAt },
            score: myBest.score,
          },
        ],
      },
    })
  }

  async countRankableByLanguage(languageId: number): Promise<number> {
    return this._prisma.userLanguageBest.count({
      where: {
        languageId,
        user: { canPublicRanking: true },
      },
    })
  }
}
