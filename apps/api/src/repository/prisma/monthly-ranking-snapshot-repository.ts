import { PrismaClient } from "@repo/db"

/**
 * `monthly_ranking_snapshots` テーブルの Repository（apps/api 用、読み取り専用）。
 *
 * apps/cron で書き込まれた当月のスナップショットを単純な SELECT で返す。
 * 詳細仕様は docs/spec/monthly-ranking/README.md を参照。
 */

/**
 * API レスポンス用 1 エントリ。ユーザー表示情報を含む
 */
export type MonthlyRankingTopEntry = {
  accuracy: number
  playedAt: Date
  rank: number
  score: number
  user: {
    avatarUrl: string | null
    currentGrade: string
    displayName: string
    id: number
  }
}

export interface MonthlyRankingSnapshotRepository {
  /**
   * 指定 (yearMonth, languageId) で rank 順に上位 limit 件を返す。
   * バッチ側で上位 10 位までに切り詰められているため、limit が 10 を超えても 10 件以下が返る
   */
  findTopByLanguage: (
    yearMonth: string,
    languageId: number,
    limit: number,
  ) => Promise<MonthlyRankingTopEntry[]>
}

export class PrismaMonthlyRankingSnapshotRepository implements MonthlyRankingSnapshotRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  findTopByLanguage = async (
    yearMonth: string,
    languageId: number,
    limit: number,
  ): Promise<MonthlyRankingTopEntry[]> => {
    const rows = await this._prisma.monthlyRankingSnapshot.findMany({
      include: {
        user: {
          include: { lifetimeStats: { select: { currentGrade: true } } },
        },
      },
      orderBy: { rank: "asc" },
      take: limit,
      where: { languageId, yearMonth },
    })
    return rows.map((row) => this._toDomain(row))
  }

  private _toDomain = (row: {
    accuracy: number
    playedAt: Date
    rank: number
    score: number
    user: {
      avatarUrl: string | null
      displayName: string | null
      id: number
      lifetimeStats: { currentGrade: string | null } | null
    }
  }): MonthlyRankingTopEntry => ({
    accuracy: row.accuracy,
    playedAt: row.playedAt,
    rank: row.rank,
    score: row.score,
    user: {
      avatarUrl: row.user.avatarUrl,
      currentGrade: row.user.lifetimeStats?.currentGrade ?? "intern",
      displayName: row.user.displayName ?? "anonymous",
      id: row.user.id,
    },
  })
}
