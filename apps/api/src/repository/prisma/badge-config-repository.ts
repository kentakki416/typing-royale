import { PrismaClient } from "@repo/db"

/**
 * BadgeConfig の domain 表現
 */
export type BadgeConfigRow = {
    displayItems: string[]
    theme: string
    updatedAt: Date
}

export type UpsertBadgeConfigInput = {
    displayItems: string[]
    theme: string
}

/**
 * BadgeConfig リポジトリのインターフェース
 *
 * 1 ユーザー = 1 行 (PK: userId)。GET /badge/:username.svg と
 * GET / PUT /api/users/me/badge-config で利用
 */
export interface BadgeConfigRepository {
    findByUserId(userId: number): Promise<BadgeConfigRow | null>
    upsert(userId: number, input: UpsertBadgeConfigInput): Promise<BadgeConfigRow>
}

/**
 * Prisma 実装の BadgeConfig リポジトリ
 */
export class PrismaBadgeConfigRepository implements BadgeConfigRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findByUserId(userId: number): Promise<BadgeConfigRow | null> {
    const row = await this._prisma.badgeConfig.findUnique({ where: { userId } })
    if (row === null) return null
    return {
      displayItems: row.displayItems as string[],
      theme: row.theme,
      updatedAt: row.updatedAt,
    }
  }

  async upsert(userId: number, input: UpsertBadgeConfigInput): Promise<BadgeConfigRow> {
    const row = await this._prisma.badgeConfig.upsert({
      create: {
        displayItems: input.displayItems,
        theme: input.theme,
        userId,
      },
      update: {
        displayItems: input.displayItems,
        theme: input.theme,
      },
      where: { userId },
    })
    return {
      displayItems: row.displayItems as string[],
      theme: row.theme,
      updatedAt: row.updatedAt,
    }
  }
}
