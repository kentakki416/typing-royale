import type { PrismaClient } from "@repo/db"

/**
 * `crawled_repos` テーブルの Repository。
 *
 * クロール対象 / 結果として 1 repo = 1 行を記録する。`disabled=true` のものは
 * 出題対象外（ライセンス NG、採用候補不足、ライセンス変更など）。
 */

export type CrawledRepoDomain = {
  id: number
  commitSha: string
  fullName: string
  languageId: number
  license: string
  name: string
  owner: string
}

export type CreateCrawledRepoInput = {
  candidatesCount: number
  commitSha: string
  crawledAt: Date
  defaultBranch: string
  description: string | null
  disabled: boolean
  disabledReason: string | null
  fullName: string
  githubId: bigint
  homepage: string | null
  languageId: number
  license: string
  name: string
  owner: string
  stars: number
  storedCount: number
  topics: string[]
}

export interface CrawledRepoRepository {
  create: (input: CreateCrawledRepoInput) => Promise<CrawledRepoDomain>
  /** ライセンス再検証で読む全 repo（disabled=false のものだけ） */
  listForLicenseRecheck: () => Promise<CrawledRepoDomain[]>
  /**
   * pickNextRepo 用。指定 language で既にクロール済みの full_name 集合を返す。
   * disabled の有無は問わない（disabled でも「再度試さない」ため除外したい）。
   */
  listRegisteredFullNames: (languageId: number) => Promise<Set<string>>
  markDisabled: (id: number, reason: string) => Promise<void>
}

export class PrismaCrawledRepoRepository implements CrawledRepoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create = async (input: CreateCrawledRepoInput): Promise<CrawledRepoDomain> => {
    const row = await this.prisma.crawledRepo.create({
      data: {
        candidatesCount: input.candidatesCount,
        commitSha: input.commitSha,
        crawledAt: input.crawledAt,
        defaultBranch: input.defaultBranch,
        description: input.description,
        disabled: input.disabled,
        disabledReason: input.disabledReason,
        fullName: input.fullName,
        githubId: input.githubId,
        homepage: input.homepage,
        languageId: input.languageId,
        license: input.license,
        name: input.name,
        owner: input.owner,
        stars: input.stars,
        storedCount: input.storedCount,
        topics: input.topics,
      },
    })
    return {
      id: row.id,
      commitSha: row.commitSha,
      fullName: row.fullName,
      languageId: row.languageId,
      license: row.license,
      name: row.name,
      owner: row.owner,
    }
  }

  listForLicenseRecheck = async (): Promise<CrawledRepoDomain[]> => {
    const rows = await this.prisma.crawledRepo.findMany({
      select: {
        commitSha: true,
        fullName: true,
        id: true,
        languageId: true,
        license: true,
        name: true,
        owner: true,
      },
      where: { disabled: false },
    })
    return rows.map((r) => ({
      id: r.id,
      commitSha: r.commitSha,
      fullName: r.fullName,
      languageId: r.languageId,
      license: r.license,
      name: r.name,
      owner: r.owner,
    }))
  }

  listRegisteredFullNames = async (languageId: number): Promise<Set<string>> => {
    const rows = await this.prisma.crawledRepo.findMany({
      select: { fullName: true },
      where: { languageId },
    })
    return new Set(rows.map((r) => r.fullName))
  }

  markDisabled = async (id: number, reason: string): Promise<void> => {
    await this.prisma.crawledRepo.update({
      data: { disabled: true, disabledReason: reason },
      where: { id },
    })
  }
}
