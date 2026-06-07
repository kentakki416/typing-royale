import { PrismaClient } from "@repo/db"

import { TransactionContext } from "./transaction-runner"

/**
 * play_session_problems 1 行の INSERT 用入力
 */
export type CreatePlaySessionProblemInput = {
    charsTyped: number
    completed: boolean
    orderIndex: number
    problemId: number
}

/**
 * PlaySessionProblem リポジトリのインターフェース
 *
 * /finish 時にセッション内の出題シーケンスを一括 INSERT する
 */
export interface PlaySessionProblemRepository {
    createMany(
        playSessionId: number,
        problems: CreatePlaySessionProblemInput[],
        tx?: TransactionContext,
    ): Promise<void>
}

/**
 * Prisma 実装の PlaySessionProblem リポジトリ
 */
export class PrismaPlaySessionProblemRepository implements PlaySessionProblemRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async createMany(
    playSessionId: number,
    problems: CreatePlaySessionProblemInput[],
    tx?: TransactionContext,
  ): Promise<void> {
    if (problems.length === 0) return
    const client = tx ?? this._prisma
    await client.playSessionProblem.createMany({
      data: problems.map((p) => ({
        charsTyped: p.charsTyped,
        completed: p.completed,
        orderIndex: p.orderIndex,
        playSessionId,
        problemId: p.problemId,
      })),
    })
  }
}
