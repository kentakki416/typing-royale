import { PrismaClient ,type Prisma } from "@repo/db"

import type { HallOfFameInPayload, MonthlyTopTenPayload, RewardLanguage } from "../../types/domain"

/**
 * Reward の domain 表現
 */
export type RewardRow = {
    id: number
    userId: number
    type: string
    payload: Record<string, unknown>
    assetUrl: string | null
    assetSvgUrl: string | null
    grantedAt: Date
}

export type UpsertRewardInput = {
    userId: number
    type: string
    payload: Record<string, unknown>
    assetUrl: string | null
    assetSvgUrl?: string | null
    grantedAt?: Date
}

/**
 * special-badges 用の冪等キー
 * - hall_of_fame_in: (type, language)
 * - monthly_top_ten: (type, language, year_month)
 */
export type SpecialBadgeKey =
    | { type: "hall_of_fame_in"; language: RewardLanguage }
    | { type: "monthly_top_ten"; language: RewardLanguage; yearMonth: string }

export type UpsertSpecialBadgeAsset = {
    assetUrl: string | null
    assetSvgUrl: string | null
    payload: HallOfFameInPayload | MonthlyTopTenPayload
}

/**
 * Reward リポジトリのインターフェース
 *
 * grade_up は (type, payload) で 1 件、special-badges (hall_of_fame_in /
 * monthly_top_ten) は部分ユニークインデックスで言語 (× year_month) ごとに 1 件
 */
export interface RewardRepository {
    findByUserId(userId: number): Promise<RewardRow[]>
    findByIds(userId: number, ids: number[]): Promise<RewardRow[]>
    findOneByUserTypePayload(userId: number, type: string, payload: Record<string, unknown>): Promise<RewardRow | null>
    findByKey(userId: number, key: SpecialBadgeKey): Promise<RewardRow | null>
    findPendingByUserId(userId: number): Promise<RewardRow[]>
    upsert(input: UpsertRewardInput): Promise<RewardRow>
    upsertByKey(userId: number, key: SpecialBadgeKey, asset: UpsertSpecialBadgeAsset): Promise<RewardRow>
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

  async findByIds(userId: number, ids: number[]): Promise<RewardRow[]> {
    if (ids.length === 0) return []
    const rows = await this._prisma.reward.findMany({
      orderBy: { grantedAt: "desc" },
      where: { id: { in: ids }, userId },
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

  async findByKey(userId: number, key: SpecialBadgeKey): Promise<RewardRow | null> {
    /**
     * 部分ユニークインデックス (rewards_hof_unique / rewards_monthly_unique) と
     * 同じ条件で検索する。payload の JSONB path 抽出を使う
     */
    const conditions: Prisma.RewardWhereInput[] = [
      { payload: { equals: key.language, path: ["language"] } },
    ]
    if (key.type === "monthly_top_ten") {
      conditions.push({ payload: { equals: key.yearMonth, path: ["year_month"] } })
    }
    const row = await this._prisma.reward.findFirst({
      where: { AND: conditions, type: key.type, userId },
    })
    return row === null ? null : this._toRow(row)
  }

  async findPendingByUserId(userId: number): Promise<RewardRow[]> {
    const rows = await this._prisma.reward.findMany({
      orderBy: { grantedAt: "asc" },
      where: {
        OR: [{ assetSvgUrl: null }, { assetUrl: null }],
        userId,
      },
    })
    return rows.map((r) => this._toRow(r))
  }

  async upsert(input: UpsertRewardInput): Promise<RewardRow> {
    const existing = await this.findOneByUserTypePayload(input.userId, input.type, input.payload)
    if (existing === null) {
      const created = await this._prisma.reward.create({
        data: {
          assetSvgUrl: input.assetSvgUrl ?? null,
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
     * 既存行があれば assetUrl / assetSvgUrl を更新（生成失敗→成功のリカバリー想定）
     */
    const updated = await this._prisma.reward.update({
      data: {
        assetSvgUrl: input.assetSvgUrl === undefined ? existing.assetSvgUrl : input.assetSvgUrl,
        assetUrl: input.assetUrl,
      },
      where: { id: existing.id },
    })
    return this._toRow(updated)
  }

  /**
   * special-badges 専用の冪等 upsert。rank が変わった場合は payload 全体を上書き
   * （部分ユニークインデックスにより同 (userId, type, language, year_month?) で 1 行のみ）
   */
  async upsertByKey(
    userId: number,
    key: SpecialBadgeKey,
    asset: UpsertSpecialBadgeAsset,
  ): Promise<RewardRow> {
    const existing = await this.findByKey(userId, key)
    if (existing === null) {
      const created = await this._prisma.reward.create({
        data: {
          assetSvgUrl: asset.assetSvgUrl,
          assetUrl: asset.assetUrl,
          grantedAt: new Date(),
          payload: asset.payload,
          type: key.type,
          userId,
        },
      })
      return this._toRow(created)
    }
    const updated = await this._prisma.reward.update({
      data: {
        assetSvgUrl: asset.assetSvgUrl,
        assetUrl: asset.assetUrl,
        payload: asset.payload,
      },
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
        assetSvgUrl: string | null
        grantedAt: Date
    }): RewardRow {
    return {
      assetSvgUrl: row.assetSvgUrl,
      assetUrl: row.assetUrl,
      grantedAt: row.grantedAt,
      id: row.id,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      type: row.type,
      userId: row.userId,
    }
  }
}
