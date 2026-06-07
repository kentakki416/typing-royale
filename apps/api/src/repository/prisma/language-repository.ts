import { PrismaClient } from "@repo/db"

/**
 * Language リポジトリのインターフェース
 *
 * step2 では languageId の存在チェックのみ。書き込みは行わない（マスタは seed で投入）
 */
export interface LanguageRepository {
    existsById(id: number): Promise<boolean>
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
}
