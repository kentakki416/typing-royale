import { PrismaClient } from "@repo/db"

import { MistypeStats, RepoInfo } from "../../types/domain"

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
 * 神セッション 1 件分のソースデータ（/challenge-gods で使う）
 */
export type GhostSourceSession = {
    crawledRepo: RepoInfo
    crawledRepoId: number
    id: number
    languageId: number
    /**
     * 神がこのセッションを実際にプレイした日時（「いつのデータか」の表示に使う）
     */
    playedAt: Date
    /**
     * play_session_problems を orderIndex 昇順に並べた problem_id 配列
     */
    problemIds: number[]
}

/**
 * PlaySession リポジトリのインターフェース
 *
 * 単一テーブル責務。複数テーブルの atomic 書き込みは Service が
 * TransactionRunner で境界を制御し、各 Repository に tx を渡す
 */
export interface PlaySessionRepository {
    create(input: CreatePlaySessionInput, tx?: TransactionContext): Promise<{ id: number }>
    /**
     * /challenge-gods で神セッションの problemIds + repoInfo を引く。
     * 神セッション削除済み等で見つからなければ null
     */
    findGhostSourceById(id: number): Promise<GhostSourceSession | null>
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

  async findGhostSourceById(id: number): Promise<GhostSourceSession | null> {
    const row = await this._prisma.playSession.findUnique({
      include: {
        crawledRepo: {
          select: {
            description: true,
            homepage: true,
            name: true,
            owner: true,
            stars: true,
            topics: true,
          },
        },
        problems: {
          orderBy: { orderIndex: "asc" },
          select: { problemId: true },
        },
      },
      where: { id },
    })
    if (!row) return null

    return {
      crawledRepo: {
        description: row.crawledRepo.description,
        homepage: row.crawledRepo.homepage,
        name: row.crawledRepo.name,
        owner: row.crawledRepo.owner,
        stars: row.crawledRepo.stars,
        /**
         * topics は jsonb 由来。string[] であることはクローラ側で保証
         */
        topics: Array.isArray(row.crawledRepo.topics)
          ? (row.crawledRepo.topics as string[])
          : [],
      },
      crawledRepoId: row.crawledRepoId,
      id: row.id,
      languageId: row.languageId,
      playedAt: row.playedAt,
      problemIds: row.problems.map((p) => p.problemId),
    }
  }
}
