import { PrismaClient } from "@repo/db"

import { TransactionContext } from "./transaction-runner"

/**
 * /finish で `user_language_best` に書き込む入力
 */
export type UpsertIfBestInput = {
    accuracy: number
    bestPlaySessionId: number
    languageId: number
    playedAt: Date
    score: number
    typedChars: number
    userId: number
}

/**
 * upsertIfBest の戻り値
 *
 * INSERT または既存より高いスコアで UPDATE したら true、
 * 既存より低いスコアだったため変更しなかった場合は false
 */
export type UpsertIfBestResult = {
    updated: boolean
}

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
 * プレイヤー詳細ページ用の言語別ベスト（言語情報込み）
 */
export type UserLanguageBestWithLanguage = MyLanguageBest & {
    language: { id: number; name: string; slug: string }
    languageId: number
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
    findAllByUserId(userId: number): Promise<UserLanguageBestWithLanguage[]>
    findMine(userId: number, languageId: number): Promise<MyLanguageBest | null>
    findTenthScore(languageId: number): Promise<number | null>
    findTopByLanguage(languageId: number, limit: number): Promise<UserLanguageBestWithUser[]>
    upsertIfBest(input: UpsertIfBestInput, tx?: TransactionContext): Promise<UpsertIfBestResult>
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

  async findAllByUserId(userId: number): Promise<UserLanguageBestWithLanguage[]> {
    const rows = await this._prisma.userLanguageBest.findMany({
      include: {
        language: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { language: { id: "asc" } },
      where: { userId },
    })
    return rows.map((row) => ({
      accuracy: row.accuracy,
      bestPlaySessionId: row.bestPlaySessionId,
      language: row.language,
      languageId: row.languageId,
      playedAt: row.playedAt,
      score: row.score,
      typedChars: row.typedChars,
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

  async findTenthScore(languageId: number): Promise<number | null> {
    const rows = await this._prisma.userLanguageBest.findMany({
      orderBy: [
        { score: "desc" },
        { accuracy: "desc" },
        { playedAt: "asc" },
      ],
      select: { score: true },
      skip: 9,
      take: 1,
      where: {
        languageId,
        user: { canPublicRanking: true },
      },
    })
    return rows.length === 0 ? null : rows[0].score
  }

  async upsertIfBest(
    input: UpsertIfBestInput,
    tx?: TransactionContext,
  ): Promise<UpsertIfBestResult> {
    const client = tx ?? this._prisma
    const existing = await client.userLanguageBest.findUnique({
      where: { userId_languageId: { languageId: input.languageId, userId: input.userId } },
    })

    if (existing === null) {
      await client.userLanguageBest.create({
        data: {
          accuracy: input.accuracy,
          bestPlaySessionId: input.bestPlaySessionId,
          languageId: input.languageId,
          playedAt: input.playedAt,
          score: input.score,
          typedChars: input.typedChars,
          userId: input.userId,
        },
      })
      return { updated: true }
    }

    /**
     * 既存と同じ tie-break ルール: score DESC, accuracy DESC, playedAt ASC
     * 新スコアが既存より「強い」場合のみ更新
     */
    const isBetter =
            input.score > existing.score
            || (input.score === existing.score && input.accuracy > existing.accuracy)
            || (input.score === existing.score
              && input.accuracy === existing.accuracy
              && input.playedAt < existing.playedAt)

    if (!isBetter) {
      return { updated: false }
    }

    await client.userLanguageBest.update({
      data: {
        accuracy: input.accuracy,
        bestPlaySessionId: input.bestPlaySessionId,
        playedAt: input.playedAt,
        score: input.score,
        typedChars: input.typedChars,
      },
      where: { id: existing.id },
    })
    return { updated: true }
  }
}
