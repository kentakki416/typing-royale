import type { PrismaClient } from "@repo/db"

/**
 * 言語マスタ (`languages`) の read 専用 Repository。
 *
 * cron では language は seed 済みの不変マスタとして扱う。task は slug
 * （"typescript" / "javascript" 等）で id を引いて processRepo に渡すだけ。
 */

export type LanguageDomain = {
  id: number
  name: string
  slug: string
}

export interface LanguageRepository {
  findBySlug: (slug: string) => Promise<LanguageDomain | null>
}

export class PrismaLanguageRepository implements LanguageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findBySlug = async (slug: string): Promise<LanguageDomain | null> => {
    const row = await this.prisma.language.findUnique({ where: { slug } })
    if (!row) return null
    return { id: row.id, name: row.name, slug: row.slug }
  }
}
