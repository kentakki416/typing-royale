import { PrismaClient } from "@repo/db"

import { TransactionContext } from "./transaction-runner"

/**
 * `monthly_ranking_snapshots` テーブルの Repository。
 *
 * v2 では `/finish` 内 transaction で当月行を直接 UPSERT する設計に変更。
 * 順位 (`rank`) はクエリ時計算する (殿堂入りと同じ設計) ため、テーブルから
 * `rank` カラムは削除済み。詳細仕様は docs/spec/monthly-ranking/README.md を参照
 */

/**
 * API レスポンス用 1 エントリ。ユーザー表示情報を含む。
 * `rank` は service 層で `idx + 1` で振るため Repository では返さない
 */
export type MonthlyRankingTopEntry = {
  accuracy: number
  playedAt: Date
  score: number
  user: {
    avatarUrl: string | null
    currentGrade: string
    displayName: string
    id: number
  }
}

export type UpsertMonthlySnapshotInput = {
  accuracy: number
  languageId: number
  playedAt: Date
  score: number
  userId: number
  yearMonth: string
}

export interface MonthlyRankingSnapshotRepository {
  /**
   * 指定 (yearMonth, languageId) で score 降順に上位 limit 件を返す。
   * tie-break は accuracy 降順、playedAt 昇順 (score-ranking と同じルール)
   */
  findTopByLanguage: (
    yearMonth: string,
    languageId: number,
    limit: number,
  ) => Promise<MonthlyRankingTopEntry[]>
  /**
   * 当月 (yearMonth, languageId) で保存されている行数を返す。
   * TOP 10 cap 維持判定に使う
   */
  countByLanguage: (yearMonth: string, languageId: number) => Promise<number>
  /**
   * 当月 cap 内の最低 score を返す。
   * 行数が cap 未満の場合は null (= 誰でも入賞判定対象)
   */
  findBoundaryScore: (
    yearMonth: string,
    languageId: number,
    cap: number,
  ) => Promise<number | null>
  /**
   * 自分の当月行を upsert する (`/finish` 内 transaction で呼ぶ)
   */
  upsertForUser: (
    input: UpsertMonthlySnapshotInput,
    tx?: TransactionContext,
  ) => Promise<void>
  /**
   * 自分以外で最低スコアの行を 1 件 delete する (TOP 10 cap 維持用)。
   * 自分の行は除外して、他の中で score / accuracy / playedAt 順の最下位を消す
   */
  deleteLowestExcluding: (
    yearMonth: string,
    languageId: number,
    excludeUserId: number,
    tx?: TransactionContext,
  ) => Promise<void>
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
      orderBy: [
        { score: "desc" },
        { accuracy: "desc" },
        { playedAt: "asc" },
      ],
      take: limit,
      where: { languageId, yearMonth },
    })
    return rows.map((row) => this._toDomain(row))
  }

  countByLanguage = async (yearMonth: string, languageId: number): Promise<number> => {
    return this._prisma.monthlyRankingSnapshot.count({
      where: { languageId, yearMonth },
    })
  }

  findBoundaryScore = async (
    yearMonth: string,
    languageId: number,
    cap: number,
  ): Promise<number | null> => {
    const rows = await this._prisma.monthlyRankingSnapshot.findMany({
      orderBy: [
        { score: "desc" },
        { accuracy: "desc" },
        { playedAt: "asc" },
      ],
      select: { score: true },
      take: cap,
      where: { languageId, yearMonth },
    })
    if (rows.length < cap) return null
    return rows[rows.length - 1].score
  }

  upsertForUser = async (
    input: UpsertMonthlySnapshotInput,
    tx?: TransactionContext,
  ): Promise<void> => {
    const client = tx ?? this._prisma
    await client.monthlyRankingSnapshot.upsert({
      create: {
        accuracy: input.accuracy,
        languageId: input.languageId,
        playedAt: input.playedAt,
        score: input.score,
        userId: input.userId,
        yearMonth: input.yearMonth,
      },
      update: {
        accuracy: input.accuracy,
        playedAt: input.playedAt,
        score: input.score,
      },
      where: {
        yearMonth_languageId_userId: {
          languageId: input.languageId,
          userId: input.userId,
          yearMonth: input.yearMonth,
        },
      },
    })
  }

  deleteLowestExcluding = async (
    yearMonth: string,
    languageId: number,
    excludeUserId: number,
    tx?: TransactionContext,
  ): Promise<void> => {
    const client = tx ?? this._prisma
    const lowest = await client.monthlyRankingSnapshot.findFirst({
      orderBy: [
        { score: "asc" },
        { accuracy: "asc" },
        { playedAt: "desc" },
      ],
      select: { userId: true },
      where: {
        languageId,
        NOT: { userId: excludeUserId },
        yearMonth,
      },
    })
    if (lowest === null) return
    await client.monthlyRankingSnapshot.delete({
      where: {
        yearMonth_languageId_userId: {
          languageId,
          userId: lowest.userId,
          yearMonth,
        },
      },
    })
  }

  private _toDomain = (row: {
    accuracy: number
    playedAt: Date
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
    score: row.score,
    user: {
      avatarUrl: row.user.avatarUrl,
      currentGrade: row.user.lifetimeStats?.currentGrade ?? "intern",
      displayName: row.user.displayName ?? "anonymous",
      id: row.user.id,
    },
  })
}
