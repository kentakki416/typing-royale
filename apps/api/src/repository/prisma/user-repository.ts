import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"

import { User } from "../../types/domain"

import { TransactionContext } from "./transaction-runner"

/**
 * ユーザー作成時の入力
 */
export type CreateUserInput = {
    avatarUrl?: string
    canPublicRanking?: boolean
    githubUsername?: string
    email?: string
}

/**
 * ユーザー更新時の入力（部分更新）
 *
 * githubUsername は空文字を許容しない（呼び出し側で trim 済みの非空文字列を渡す前提）。
 * canPublicRanking は明示的に true/false を切り替えるため optional。
 */
export type UpdateUserInput = {
    canPublicRanking?: boolean
    /**
     * undefined で変更なし、null で空欄リセット
     */
    favoriteRepoUrl?: string | null
}

/**
 * /api/players/:userId が返す公開プロフィール用 user 情報
 * （canPublicRanking はプライバシー判定にのみ使い、レスポンスには含めない）
 */
export type PublicProfileUser = {
    avatarUrl: string | null
    canPublicRanking: boolean
    createdAt: Date
    githubUsername: string
    id: number
}

/**
 * ユーザーリポジトリのインターフェース
 */
export interface UserRepository {
    create(data: CreateUserInput, tx?: TransactionContext): Promise<User>
    delete(id: number): Promise<void>
    findByGithubUsername(githubUsername: string): Promise<PublicProfileUser | null>
    findByEmail(email: string): Promise<User | null>
    findById(id: number): Promise<User | null>
    findPublicProfile(userId: number): Promise<PublicProfileUser | null>
    update(id: number, data: UpdateUserInput): Promise<User>
}

/**
 * Prisma実装のユーザーリポジトリ
 */
export class PrismaUserRepository implements UserRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findById(id: number): Promise<User | null> {
    const prismaUser = await this._prisma.user.findUnique({ where: { id } })
    if (!prismaUser) return null
    return this._toDomainUser(prismaUser)
  }

  async findByEmail(email: string): Promise<User | null> {
    const prismaUser = await this._prisma.user.findUnique({ where: { email } })
    if (!prismaUser) return null
    return this._toDomainUser(prismaUser)
  }

  async findByGithubUsername(githubUsername: string): Promise<PublicProfileUser | null> {
    /**
     * githubUsername は現状 @@unique でない (GitHub username の衝突を将来想定する場合あり)
     * MVP では最初に hit した 1 件を返す
     */
    const row = await this._prisma.user.findFirst({
      select: {
        id: true,
        avatarUrl: true,
        canPublicRanking: true,
        createdAt: true,
        githubUsername: true,
      },
      where: { githubUsername },
    })
    if (row === null) return null
    return {
      avatarUrl: row.avatarUrl,
      canPublicRanking: row.canPublicRanking,
      createdAt: row.createdAt,
      githubUsername: row.githubUsername ?? `user${row.id}`,
      id: row.id,
    }
  }

  async findPublicProfile(userId: number): Promise<PublicProfileUser | null> {
    const row = await this._prisma.user.findUnique({
      select: {
        id: true,
        avatarUrl: true,
        canPublicRanking: true,
        createdAt: true,
        githubUsername: true,
      },
      where: { id: userId },
    })
    if (row === null) return null
    return {
      avatarUrl: row.avatarUrl,
      canPublicRanking: row.canPublicRanking,
      createdAt: row.createdAt,
      githubUsername: row.githubUsername ?? `user${row.id}`,
      id: row.id,
    }
  }

  async create(data: CreateUserInput, tx?: TransactionContext): Promise<User> {
    const client = tx ?? this._prisma
    const prismaUser = await client.user.create({
      data: {
        avatarUrl: data.avatarUrl,
        canPublicRanking: data.canPublicRanking ?? true,
        githubUsername: data.githubUsername,
        email: data.email,
      },
    })
    return this._toDomainUser(prismaUser)
  }

  async update(id: number, data: UpdateUserInput): Promise<User> {
    const prismaUser = await this._prisma.user.update({
      data: {
        ...(data.canPublicRanking !== undefined && { canPublicRanking: data.canPublicRanking }),
        ...(data.favoriteRepoUrl !== undefined && { favoriteRepoUrl: data.favoriteRepoUrl }),
      },
      where: { id },
    })
    return this._toDomainUser(prismaUser)
  }

  /**
   * onDelete: Cascade により AuthAccount もまとめて削除される。
   * 将来 score / keystroke_logs 等を追加した際も FK カスケードで連動削除されることを前提とする。
   */
  async delete(id: number): Promise<void> {
    await this._prisma.user.delete({ where: { id } })
  }

  /**
   * Prismaの型 → ドメインの型に変換
   */
  private _toDomainUser(prismaUser: PrismaTypes.UserGetPayload<{}>): User {
    return {
      avatarUrl: prismaUser.avatarUrl,
      canPublicRanking: prismaUser.canPublicRanking,
      createdAt: prismaUser.createdAt,
      githubUsername: prismaUser.githubUsername,
      email: prismaUser.email,
      favoriteRepoUrl: prismaUser.favoriteRepoUrl,
      id: prismaUser.id,
      updatedAt: prismaUser.updatedAt,
    }
  }
}
