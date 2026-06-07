import { gzipSync } from "node:zlib"

import { Prisma, PrismaClient } from "@repo/db"

import { KeystrokeLog, MistypeStats } from "../../types/domain"

/**
 * play_sessions の INSERT 用入力
 */
export type CreatePlaySessionInput = {
    accuracy: number
    crawledRepoId: number
    ghostSessionId: number | null
    languageId: number
    mode: "solo" | "challenge_gods"
    mistypeStats: MistypeStats
    playedAt: Date
    problemsCompleted: number
    problemsPlayed: number
    score: number
    typedChars: number
    userId: number
}

/**
 * play_session_problems の INSERT 用入力
 */
export type CreatePlaySessionProblemInput = {
    charsTyped: number
    completed: boolean
    orderIndex: number
    problemId: number
}

/**
 * PlaySession リポジトリのインターフェース
 *
 * /finish では 4 テーブル（play_sessions / play_session_problems /
 * keystroke_logs / user_lifetime_stats）への書き込みを 1 transaction で完結させる
 */
export interface PlaySessionRepository {
    /**
     * play_sessions + play_session_problems + keystroke_logs を 1 transaction で作成し、
     * user_lifetime_stats の upsert も同 transaction で実行する
     */
    createWithChildrenAndUpdateStats(input: {
        keystrokeLog: KeystrokeLog
        problems: CreatePlaySessionProblemInput[]
        session: CreatePlaySessionInput
    }): Promise<{ id: number }>
}

/**
 * Prisma 実装の PlaySession リポジトリ
 */
export class PrismaPlaySessionRepository implements PlaySessionRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async createWithChildrenAndUpdateStats(input: {
        keystrokeLog: KeystrokeLog
        problems: CreatePlaySessionProblemInput[]
        session: CreatePlaySessionInput
    }): Promise<{ id: number }> {
    return this._prisma.$transaction(async (tx) => {
      /**
       * 1. play_sessions 作成
       */
      const session = await tx.playSession.create({
        data: {
          accuracy: input.session.accuracy,
          crawledRepoId: input.session.crawledRepoId,
          ghostSessionId: input.session.ghostSessionId,
          languageId: input.session.languageId,
          mistypeStats: input.session.mistypeStats,
          mode: input.session.mode,
          playedAt: input.session.playedAt,
          problemsCompleted: input.session.problemsCompleted,
          problemsPlayed: input.session.problemsPlayed,
          score: input.session.score,
          typedChars: input.session.typedChars,
          userId: input.session.userId,
        },
      })

      /**
       * 2. play_session_problems を一括作成
       */
      if (input.problems.length > 0) {
        await tx.playSessionProblem.createMany({
          data: input.problems.map((p) => ({
            charsTyped: p.charsTyped,
            completed: p.completed,
            orderIndex: p.orderIndex,
            playSessionId: session.id,
            problemId: p.problemId,
          })),
        })
      }

      /**
       * 3. keystroke_logs に gzip 圧縮バイナリを保存
       */
      const compressed = gzipSync(Buffer.from(JSON.stringify(input.keystrokeLog)))
      await tx.keystrokeLog.create({
        data: { compressedLog: compressed, playSessionId: session.id },
      })

      /**
       * 4. user_lifetime_stats の upsert
       */
      await this._upsertLifetimeStats(tx, input.session)

      return { id: session.id }
    })
  }

  /**
   * 言語別 bestScore を JSON で更新する。
   * 言語名ではなく languageId を文字列にしてキーにする（言語名は別 join で引く想定）。
   */
  private async _upsertLifetimeStats(
    tx: Prisma.TransactionClient,
    s: CreatePlaySessionInput,
  ): Promise<void> {
    const existing = await tx.userLifetimeStats.findUnique({ where: { userId: s.userId } })
    const langKey = String(s.languageId)

    if (!existing) {
      await tx.userLifetimeStats.create({
        data: {
          bestScore: s.score,
          bestScoreByLanguage: { [langKey]: s.score },
          lifetimeMistypeStats: s.mistypeStats,
          totalSessions: 1,
          totalTypedChars: BigInt(s.typedChars),
          userId: s.userId,
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
      [langKey]: Math.max(currentByLang[langKey] ?? 0, s.score),
    }
    const currentMistype = (existing.lifetimeMistypeStats ?? {}) as MistypeStats
    const newMistype: MistypeStats = { ...currentMistype }
    for (const [key, count] of Object.entries(s.mistypeStats)) {
      newMistype[key] = (newMistype[key] ?? 0) + count
    }

    await tx.userLifetimeStats.update({
      data: {
        bestScore: Math.max(existing.bestScore, s.score),
        bestScoreByLanguage: newByLang,
        lifetimeMistypeStats: newMistype,
        totalSessions: existing.totalSessions + 1,
        totalTypedChars: existing.totalTypedChars + BigInt(s.typedChars),
      },
      where: { userId: s.userId },
    })
  }
}
