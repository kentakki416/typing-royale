import { PrismaClient } from "@repo/db"

import { MistypeStats } from "../../types/domain"

import { TransactionContext } from "./transaction-runner"

/**
 * play_sessions 行の INSERT 用入力
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
 * PlaySession リポジトリのインターフェース
 *
 * 単一テーブル責務。複数テーブルの atomic 書き込みは Service が
 * TransactionRunner で境界を制御し、各 Repository に tx を渡す
 */
export interface PlaySessionRepository {
    create(input: CreatePlaySessionInput, tx?: TransactionContext): Promise<{ id: number }>
}

/**
 * Prisma 実装の PlaySession リポジトリ
 */
export class PrismaPlaySessionRepository implements PlaySessionRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async create(input: CreatePlaySessionInput, tx?: TransactionContext): Promise<{ id: number }> {
    const client = tx ?? this._prisma
    const row = await client.playSession.create({
      data: {
        accuracy: input.accuracy,
        crawledRepoId: input.crawledRepoId,
        ghostSessionId: input.ghostSessionId,
        languageId: input.languageId,
        mistypeStats: input.mistypeStats,
        mode: input.mode,
        playedAt: input.playedAt,
        problemsCompleted: input.problemsCompleted,
        problemsPlayed: input.problemsPlayed,
        score: input.score,
        typedChars: input.typedChars,
        userId: input.userId,
      },
      select: { id: true },
    })
    return { id: row.id }
  }
}
