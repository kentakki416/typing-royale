import { PrismaClient ,type Prisma } from "@repo/db"

/**
 * Reward の domain 表現
 */
export type RewardRow = {
    id: number
    userId: number
    type: string
    payload: Record<string, unknown>
    assetUrl: string | null
    grantedAt: Date
}

export type UpsertRewardInput = {
    userId: number
    type: string
    payload: Record<string, unknown>
    assetUrl: string | null
    grantedAt?: Date
}

/**
 * Reward リポジトリのインターフェース
 *
 * 達成カード PNG の生成記録の読み書き。type + payload で一意 (同じ達成は 1 度生成
 * したら再利用)
 */
export interface RewardRepository {
    findByUserId(userId: number): Promise<RewardRow[]>
    findOneByUserTypePayload(userId: number, type: string, payload: Record<string, unknown>): Promise<RewardRow | null>
    upsert(input: UpsertRewardInput): Promise<RewardRow>
}

/**
 * Prisma 実装の Reward リポジトリ
 */
export class PrismaRewardRepository implements RewardRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findByUserId(userId: number): Promise<RewardRow[]> {
    const rows = await this._prisma.reward.findMany({
      orderBy: { grantedAt: "desc" },
      where: { userId },
    })
    return rows.map((r) => this._toRow(r))
  }

  async findOneByUserTypePayload(
    userId: number,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<RewardRow | null> {
    /**
     * payload の object equals 検索。MVP は小さい object (1 key) なので
     * Prisma の `equals` で十分。将来 payload が複雑化したら raw SQL に切り替える
     */
    const row = await this._prisma.reward.findFirst({
      where: {
        payload: { equals: payload as Prisma.InputJsonValue },
        type,
        userId,
      },
    })
    return row === null ? null : this._toRow(row)
  }

  async upsert(input: UpsertRewardInput): Promise<RewardRow> {
    const existing = await this.findOneByUserTypePayload(input.userId, input.type, input.payload)
    if (existing === null) {
      const created = await this._prisma.reward.create({
        data: {
          assetUrl: input.assetUrl,
          grantedAt: input.grantedAt ?? new Date(),
          payload: input.payload as Prisma.InputJsonValue,
          type: input.type,
          userId: input.userId,
        },
      })
      return this._toRow(created)
    }
    /**
     * 既存行があれば assetUrl のみ更新（生成失敗→成功のリカバリー想定）
     */
    const updated = await this._prisma.reward.update({
      data: { assetUrl: input.assetUrl },
      where: { id: existing.id },
    })
    return this._toRow(updated)
  }

  private _toRow(row: {
        id: number
        userId: number
        type: string
        payload: unknown
        assetUrl: string | null
        grantedAt: Date
    }): RewardRow {
    return {
      assetUrl: row.assetUrl,
      grantedAt: row.grantedAt,
      id: row.id,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      type: row.type,
      userId: row.userId,
    }
  }
}
