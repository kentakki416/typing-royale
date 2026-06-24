import type { PrismaClient } from "@repo/db"

/**
 * 画像生成ステータス。apps/api の RewardGenerationStatus と同じ値を意図的に複製している。
 * worker は @repo/api-schema / apps/api の domain 型に依存しないため、必要最小限の型を
 * 自前で持つ（generate-image が RewardLanguage を複製しているのと同じ方針）。
 */
export type RewardGenerationStatus = "completed" | "failed" | "pending" | "processing"

/**
 * worker が generate-reward ジョブで扱う reward の最小ドメイン表現。
 */
export type RewardRow = {
    id: number
    userId: number
    type: string
    payload: Record<string, unknown>
    assetUrl: string | null
    assetSvgUrl: string | null
    generationStatus: RewardGenerationStatus
    grantedAt: Date
}

/**
 * 画像生成完了時に書き込む asset。
 */
export type CompleteRewardAssets = {
    assetSvgUrl: string | null
    assetUrl: string
}

/**
 * worker 側で必要な reward 操作の interface。
 *
 * apps/api の RewardRepository とは意図的に分離している。
 * 各 app は必要な操作のみを持つ独自 interface を定義する方針。
 */
export interface RewardRepository {
    findById(id: number): Promise<RewardRow | null>
    /** 画像生成のステート遷移 ("processing" / "failed") を保存する */
    updateGenerationStatus(id: number, status: RewardGenerationStatus): Promise<void>
    /** asset_url / asset_svg_url を埋めて generation_status="completed" にする */
    updateAssetsAndComplete(id: number, assets: CompleteRewardAssets): Promise<void>
}

/**
 * Prisma 実装の RewardRepository
 */
export class PrismaRewardRepository implements RewardRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findById(id: number): Promise<RewardRow | null> {
    const row = await this._prisma.reward.findUnique({ where: { id } })
    return row === null ? null : this._toRow(row)
  }

  public async updateGenerationStatus(
    id: number,
    status: RewardGenerationStatus,
  ): Promise<void> {
    await this._prisma.reward.update({
      data: { generationStatus: status },
      where: { id },
    })
  }

  public async updateAssetsAndComplete(
    id: number,
    assets: CompleteRewardAssets,
  ): Promise<void> {
    await this._prisma.reward.update({
      data: {
        assetSvgUrl: assets.assetSvgUrl,
        assetUrl: assets.assetUrl,
        generationStatus: "completed",
      },
      where: { id },
    })
  }

  private _toRow(row: {
        id: number
        userId: number
        type: string
        payload: unknown
        assetUrl: string | null
        assetSvgUrl: string | null
        generationStatus: string
        grantedAt: Date
    }): RewardRow {
    return {
      assetSvgUrl: row.assetSvgUrl,
      assetUrl: row.assetUrl,
      generationStatus: row.generationStatus as RewardGenerationStatus,
      grantedAt: row.grantedAt,
      id: row.id,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      type: row.type,
      userId: row.userId,
    }
  }
}
