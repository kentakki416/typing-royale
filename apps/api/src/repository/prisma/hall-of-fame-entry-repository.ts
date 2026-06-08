import { PrismaClient } from "@repo/db"

/**
 * HallOfFameEntry の domain 表現
 */
export type HallOfFameEntryRow = {
    id: number
    userId: number
    languageId: number
    bestPlaySessionId: number
    comment: string | null
    commentSubmittedAt: Date | null
}

/**
 * POST /api/hall-of-fame/comments の入力（upsert）
 */
export type UpsertHallOfFameCommentInput = {
    userId: number
    languageId: number
    bestPlaySessionId: number
    comment: string
}

/**
 * HallOfFameEntry リポジトリのインターフェース
 *
 * Hall of Fame コメントの読み書き。順位は user_language_best を ORDER BY して
 * 表示時に JOIN するため、ここでは rank を扱わない
 */
export interface HallOfFameEntryRepository {
    findById(id: number): Promise<HallOfFameEntryRow | null>
    findManyByUserIds(userIds: number[], languageId: number): Promise<HallOfFameEntryRow[]>
    updateComment(id: number, comment: string): Promise<HallOfFameEntryRow>
    upsertComment(input: UpsertHallOfFameCommentInput): Promise<HallOfFameEntryRow>
}

/**
 * Prisma 実装の HallOfFameEntry リポジトリ
 */
export class PrismaHallOfFameEntryRepository implements HallOfFameEntryRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findById(id: number): Promise<HallOfFameEntryRow | null> {
    const row = await this._prisma.hallOfFameEntry.findUnique({ where: { id } })
    return row === null ? null : this._toRow(row)
  }

  async findManyByUserIds(userIds: number[], languageId: number): Promise<HallOfFameEntryRow[]> {
    if (userIds.length === 0) return []
    const rows = await this._prisma.hallOfFameEntry.findMany({
      where: { languageId, userId: { in: userIds } },
    })
    return rows.map((r) => this._toRow(r))
  }

  async upsertComment(input: UpsertHallOfFameCommentInput): Promise<HallOfFameEntryRow> {
    const now = new Date()
    /**
     * 既存行があれば comment / bestPlaySessionId を update（commentSubmittedAt は維持）。
     * 既存行が無ければ create で commentSubmittedAt も now にセット。
     * その後で「既存行だったが commentSubmittedAt が null だった」レアケースだけ
     * second-pass で now に書き込む
     */
    const row = await this._prisma.hallOfFameEntry.upsert({
      create: {
        bestPlaySessionId: input.bestPlaySessionId,
        comment: input.comment,
        commentSubmittedAt: now,
        languageId: input.languageId,
        userId: input.userId,
      },
      update: {
        bestPlaySessionId: input.bestPlaySessionId,
        comment: input.comment,
      },
      where: { userId_languageId: { languageId: input.languageId, userId: input.userId } },
    })
    if (row.commentSubmittedAt === null) {
      const patched = await this._prisma.hallOfFameEntry.update({
        data: { commentSubmittedAt: now },
        where: { id: row.id },
      })
      return this._toRow(patched)
    }
    return this._toRow(row)
  }

  async updateComment(id: number, comment: string): Promise<HallOfFameEntryRow> {
    const row = await this._prisma.hallOfFameEntry.update({
      data: { comment },
      where: { id },
    })
    return this._toRow(row)
  }

  private _toRow(row: {
        id: number
        userId: number
        languageId: number
        bestPlaySessionId: number
        comment: string | null
        commentSubmittedAt: Date | null
    }): HallOfFameEntryRow {
    return {
      bestPlaySessionId: row.bestPlaySessionId,
      comment: row.comment,
      commentSubmittedAt: row.commentSubmittedAt,
      id: row.id,
      languageId: row.languageId,
      userId: row.userId,
    }
  }
}
