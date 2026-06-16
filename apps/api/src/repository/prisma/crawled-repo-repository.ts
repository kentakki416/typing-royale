import { PrismaClient } from "@repo/db"

import { RepoInfo } from "../../types/domain"

/**
 * 一覧表示用のクロール済みリポジトリ情報
 */
export type CrawledRepoListItem = {
    description: string | null
    fullName: string
    homepage: string | null
    name: string
    owner: string
    stars: number
    storedCount: number
    topics: string[]
}

/**
 * CrawledRepo リポジトリのインターフェース
 *
 * 書き込みは apps/cron 側の責務
 */
export interface CrawledRepoRepository {
    /**
     * 指定言語の有効リポジトリを stars 降順で一覧取得。
     * disabled=false かつ storedCount>0（実際に出題実績がある）でフィルタ
     */
    findActiveByLanguageId(languageId: number, limit: number): Promise<CrawledRepoListItem[]>

    /**
     * 指定言語の eligible（disabled=false）repo から 1 件をランダム選択
     * eligible な repo が 0 件の場合は null
     */
    pickRandomEligibleByLanguageId(languageId: number): Promise<{
        id: number
        repoInfo: RepoInfo
    } | null>
}

/**
 * Prisma 実装の CrawledRepo リポジトリ
 */
export class PrismaCrawledRepoRepository implements CrawledRepoRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findActiveByLanguageId(languageId: number, limit: number): Promise<CrawledRepoListItem[]> {
    const rows = await this._prisma.crawledRepo.findMany({
      orderBy: { stars: "desc" },
      select: {
        description: true,
        fullName: true,
        homepage: true,
        name: true,
        owner: true,
        stars: true,
        storedCount: true,
        topics: true,
      },
      take: limit,
      where: {
        disabled: false,
        languageId,
        storedCount: { gt: 0 },
      },
    })
    return rows.map((row) => ({
      description: row.description,
      fullName: row.fullName,
      homepage: row.homepage,
      name: row.name,
      owner: row.owner,
      stars: row.stars,
      storedCount: row.storedCount,
      topics: Array.isArray(row.topics) ? row.topics as string[] : [],
    }))
  }

  async pickRandomEligibleByLanguageId(languageId: number): Promise<{
        id: number
        repoInfo: RepoInfo
    } | null> {
    /**
     * eligible 件数は数百のオーダーなので ORDER BY random() で十分軽量
     * Prisma の orderBy では random() を直接書けないため $queryRaw を使う
     */
    const rows = await this._prisma.$queryRaw<Array<{
            id: number
            owner: string
            name: string
            description: string | null
            homepage: string | null
            stars: number
            topics: unknown
        }>>`
      SELECT id, owner, name, description, homepage, stars, topics
      FROM crawled_repos
      WHERE language_id = ${languageId} AND disabled = false
      ORDER BY random()
      LIMIT 1
    `
    if (rows.length === 0) return null
    const row = rows[0]
    return {
      id: row.id,
      repoInfo: {
        description: row.description,
        homepage: row.homepage,
        name: row.name,
        owner: row.owner,
        stars: row.stars,
        /**
         * topics は jsonb 由来。string[] であることはクローラ側で保証
         */
        topics: Array.isArray(row.topics) ? row.topics as string[] : [],
      },
    }
  }
}
