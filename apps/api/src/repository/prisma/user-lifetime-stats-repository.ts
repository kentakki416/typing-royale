import { PrismaClient } from "@repo/db"

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
 * グレード判定 / 進捗表示に使う累計値の subset
 */
export type UserLifetimeStatsSummary = {
    bestScore: number
    currentGrade: string | null
}

/**
 * UserLifetimeStats リポジトリのインターフェース
 *
 * /finish 完了時にユーザーごとの累計値を upsert で加算する。
 * 言語別 bestScore / 生涯 mistypeStats のマージもここで行う
 */
export interface UserLifetimeStatsRepository {
    findByUserId(userId: number): Promise<UserLifetimeStatsSummary | null>
    upsertOnFinish(input: UpsertOnFinishInput, tx?: TransactionContext): Promise<void>
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
      select: { bestScore: true, currentGrade: true },
      where: { userId },
    })
    return row
  }

  async upsertOnFinish(input: UpsertOnFinishInput, tx?: TransactionContext): Promise<void> {
    const client = tx ?? this._prisma
    const existing = await client.userLifetimeStats.findUnique({ where: { userId: input.userId } })

    /**
     * 言語別 bestScore は languageId 文字列をキーにする
     * （言語名は別 join で引く想定。step5 / score-ranking で必要なら拡張）
     */
    const langKey = String(input.languageId)

    if (!existing) {
      await client.userLifetimeStats.create({
        data: {
          bestScore: input.score,
          bestScoreByLanguage: { [langKey]: input.score },
          lifetimeMistypeStats: input.mistypeStats,
          totalSessions: 1,
          totalTypedChars: BigInt(input.typedChars),
          userId: input.userId,
        },
      })
      return
    }

    /**
     * 既存値とのマージ
     */
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

    await client.userLifetimeStats.update({
      data: {
        bestScore: Math.max(existing.bestScore, input.score),
        bestScoreByLanguage: newByLang,
        lifetimeMistypeStats: newMistype,
        totalSessions: existing.totalSessions + 1,
        totalTypedChars: existing.totalTypedChars + BigInt(input.typedChars),
      },
      where: { userId: input.userId },
    })
  }
}
