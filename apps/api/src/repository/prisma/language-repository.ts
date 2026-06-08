import { PrismaClient } from "@repo/db"

/**
 * slug 引きで返す軽量な Language
 */
export type LanguageRef = {
    id: number
    slug: string
}

/**
 * Language リポジトリのインターフェース
 *
 * 書き込みは行わない（マスタは seed で投入）
 */
export interface LanguageRepository {
    existsById(id: number): Promise<boolean>
    findById(id: number): Promise<LanguageRef | null>
    findBySlug(slug: string): Promise<LanguageRef | null>
}

/**
 * Prisma 実装の Language リポジトリ
 */
export class PrismaLanguageRepository implements LanguageRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async existsById(id: number): Promise<boolean> {
    const lang = await this._prisma.language.findUnique({
      select: { id: true },
      where: { id },
    })
    return lang !== null
  }

  async findBySlug(slug: string): Promise<LanguageRef | null> {
    const lang = await this._prisma.language.findUnique({
      select: { id: true, slug: true },
      where: { slug },
    })
    return lang
  }

  async findById(id: number): Promise<LanguageRef | null> {
    const lang = await this._prisma.language.findUnique({
      select: { id: true, slug: true },
      where: { id },
    })
    return lang
  }
}
