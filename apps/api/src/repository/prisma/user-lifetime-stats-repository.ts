import { PrismaClient } from "@repo/db"

import { calcGrade, Grade } from "../../lib/grade"
import { MistypeStats } from "../../types/domain"

import { TransactionContext } from "./transaction-runner"

/**
 * /finish 1 セッション完了時の累計加算入力
 */
export type UpsertOnFinishInput = {
    languageId: number
    mistypeStats: MistypeStats
    score: number
    typedChars: number
    userId: number
}

/**
 * upsertOnFinish の戻り値
 *
 * グレードレベルが上がった場合のみ from/to を返す。同一グレードに留まれば null
 */
export type UpsertOnFinishResult = {
    gradeUp: { from: Grade; to: Grade } | null
}

/**
 * グレード判定 / プレイヤー詳細表示に使う累計値の subset
 * （score-ranking step4 で /api/players/:userId が currentGradeReachedAt /
 * streakDays / totalSessions / totalTypedChars も必要になったため拡張）
 */
export type UserLifetimeStatsSummary = {
    bestScore: number
    currentGrade: string | null
    currentGradeReachedAt: Date | null
    lifetimeMistypeStats: MistypeStats
    streakDays: number
    totalSessions: number
    totalTypedChars: bigint
}

/**
 * UserLifetimeStats リポジトリのインターフェース
 *
 * /finish 完了時にユーザーごとの累計値を upsert で加算する。
 * 言語別 bestScore / 生涯 mistypeStats のマージ + currentGrade 更新を 1 トランザクションで行う
 */
export interface UserLifetimeStatsRepository {
    findByUserId(userId: number): Promise<UserLifetimeStatsSummary | null>
    upsertOnFinish(input: UpsertOnFinishInput, tx?: TransactionContext): Promise<UpsertOnFinishResult>
}

/**
 * Prisma 実装の UserLifetimeStats リポジトリ
 */
export class PrismaUserLifetimeStatsRepository implements UserLifetimeStatsRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findByUserId(userId: number): Promise<UserLifetimeStatsSummary | null> {
    const row = await this._prisma.userLifetimeStats.findUnique({
      select: {
        bestScore: true,
        currentGrade: true,
        currentGradeReachedAt: true,
        lifetimeMistypeStats: true,
        streakDays: true,
        totalSessions: true,
        totalTypedChars: true,
      },
      where: { userId },
    })
    if (row === null) return null
    return {
      ...row,
      lifetimeMistypeStats: (row.lifetimeMistypeStats ?? {}) as MistypeStats,
    }
  }

  async upsertOnFinish(
    input: UpsertOnFinishInput,
    tx?: TransactionContext,
  ): Promise<UpsertOnFinishResult> {
    const client = tx ?? this._prisma
    const existing = await client.userLifetimeStats.findUnique({ where: { userId: input.userId } })

    /**
     * 言語別 bestScore は languageId 文字列をキーにする
     * （言語名は別 join で引く想定。step5 / score-ranking で必要なら拡張）
     */
    const langKey = String(input.languageId)

    if (!existing) {
      const newGrade = calcGrade(input.score)
      await client.userLifetimeStats.create({
        data: {
          bestScore: input.score,
          bestScoreByLanguage: { [langKey]: input.score },
          currentGrade: newGrade.slug,
          currentGradeReachedAt: newGrade.level > 1 ? new Date() : null,
          lifetimeMistypeStats: input.mistypeStats,
          totalSessions: 1,
          totalTypedChars: BigInt(input.typedChars),
          userId: input.userId,
        },
      })
      /**
       * 初回プレイで Intern より上のグレードに到達した場合のみ祝賀通知
       * （初プレイで Intern のままなら通知不要）
       */
      return {
        gradeUp: newGrade.level > 1
          ? { from: calcGrade(0), to: newGrade }
          : null,
      }
    }

    /**
     * 既存値とのマージ
     */
    const prevBest = existing.bestScore
    const newBest = Math.max(prevBest, input.score)
    const prevGrade = calcGrade(prevBest)
    const newGrade = calcGrade(newBest)

    const currentByLang = (existing.bestScoreByLanguage ?? {}) as Record<string, number>
    const newByLang = {
      ...currentByLang,
      [langKey]: Math.max(currentByLang[langKey] ?? 0, input.score),
    }
    const currentMistype = (existing.lifetimeMistypeStats ?? {}) as MistypeStats
    const newMistype: MistypeStats = { ...currentMistype }
    for (const [key, count] of Object.entries(input.mistypeStats)) {
      newMistype[key] = (newMistype[key] ?? 0) + count
    }

    const gradeLeveledUp = newGrade.level > prevGrade.level

    await client.userLifetimeStats.update({
      data: {
        bestScore: newBest,
        bestScoreByLanguage: newByLang,
        currentGrade: newGrade.slug,
        /**
         * グレードレベルが上がったときのみ達成日時を更新
         * （マイページの「YYYY-MM-DD 達成」表示用）
         */
        currentGradeReachedAt: gradeLeveledUp ? new Date() : existing.currentGradeReachedAt,
        lifetimeMistypeStats: newMistype,
        totalSessions: existing.totalSessions + 1,
        totalTypedChars: existing.totalTypedChars + BigInt(input.typedChars),
      },
      where: { userId: input.userId },
    })

    return {
      gradeUp: gradeLeveledUp ? { from: prevGrade, to: newGrade } : null,
    }
  }
}
