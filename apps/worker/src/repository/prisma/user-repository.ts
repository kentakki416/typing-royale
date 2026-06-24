import type { PrismaClient } from "@repo/db"

/**
 * worker が reward の username 描画に必要な公開プロフィールの最小表現。
 */
export type PublicProfile = {
    id: number
    githubUsername: string | null
}

/**
 * worker 側で必要な user 操作の interface。
 *
 * apps/api の UserRepository とは意図的に分離している。
 * 各 app は必要な操作のみを持つ独自 interface を定義する方針。
 */
export interface UserRepository {
    findPublicProfile(userId: number): Promise<PublicProfile | null>
}

/**
 * Prisma 実装の UserRepository
 */
export class PrismaUserRepository implements UserRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findPublicProfile(userId: number): Promise<PublicProfile | null> {
    const row = await this._prisma.user.findUnique({
      select: { id: true, githubUsername: true },
      where: { id: userId },
    })
    return row === null ? null : { githubUsername: row.githubUsername, id: row.id }
  }
}
