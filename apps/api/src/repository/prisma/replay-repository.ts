import { PrismaClient } from "@repo/db"

/**
 * リプレイ画面で 1 セッション分の表示に必要な domain 表現
 *
 * 既存 PlaySession + 関連テーブル一式を fetch し、Service / Controller で
 * 取り回しやすい平坦な形に整形して返す
 */
export type ReplaySource = {
    accuracy: number
    crawledRepo: {
        description: string | null
        homepage: string | null
        license: string
        name: string
        owner: string
        stars: number
        topics: unknown
    }
    id: number
    language: { slug: string }
    playedAt: Date
    problems: Array<{
        orderIndex: number
        problem: {
            charCount: number
            codeBlock: string
            functionName: string
            id: number
            lineCount: number
            sourceUrl: string
        }
    }>
    problemsCompleted: number
    score: number
    typedChars: number
    user: {
        avatarUrl: string | null
        canPublicRanking: boolean
        currentGrade: string | null
        displayName: string | null
        id: number
    }
}

/**
 * 注目リプレイ 1 件
 *
 * `hall_of_fame_entries` の comment 付きエントリと、リンク先 PlaySession / User の display 情報
 */
export type FeaturedReplayRow = {
    comment: string
    commentSubmittedAt: Date
    language: { slug: string }
    playSession: {
        accuracy: number
        id: number
        score: number
        typedChars: number
    }
    user: {
        avatarUrl: string | null
        currentGrade: string | null
        displayName: string | null
        id: number
    }
}

/**
 * リプレイ閲覧用リポジトリ
 *
 * play_sessions + player + play_session_problems + crawled_repos + language を
 * 1 回の findUnique で取得し、Service が後段で keystroke_logs を別途取りに行く
 */
export interface ReplayRepository {
    findById(playSessionId: number): Promise<ReplaySource | null>
    findFeatured(input: { language?: string; limit: number }): Promise<FeaturedReplayRow[]>
}

/**
 * Prisma 実装の Replay リポジトリ
 */
export class PrismaReplayRepository implements ReplayRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findById(playSessionId: number): Promise<ReplaySource | null> {
    const row = await this._prisma.playSession.findUnique({
      include: {
        crawledRepo: {
          select: {
            description: true,
            homepage: true,
            license: true,
            name: true,
            owner: true,
            stars: true,
            topics: true,
          },
        },
        language: { select: { slug: true } },
        problems: {
          include: {
            problem: {
              select: {
                charCount: true,
                codeBlock: true,
                functionName: true,
                id: true,
                lineCount: true,
                sourceUrl: true,
              },
            },
          },
          orderBy: { orderIndex: "asc" },
        },
        user: {
          include: { lifetimeStats: { select: { currentGrade: true } } },
        },
      },
      where: { id: playSessionId },
    })
    if (!row) return null
    return {
      accuracy: row.accuracy,
      crawledRepo: {
        description: row.crawledRepo.description,
        homepage: row.crawledRepo.homepage,
        license: row.crawledRepo.license,
        name: row.crawledRepo.name,
        owner: row.crawledRepo.owner,
        stars: row.crawledRepo.stars,
        topics: row.crawledRepo.topics,
      },
      id: row.id,
      language: { slug: row.language.slug },
      playedAt: row.playedAt,
      problems: row.problems.map((p) => ({
        orderIndex: p.orderIndex,
        problem: p.problem,
      })),
      problemsCompleted: row.problemsCompleted,
      score: row.score,
      typedChars: row.typedChars,
      user: {
        avatarUrl: row.user.avatarUrl,
        canPublicRanking: row.user.canPublicRanking,
        currentGrade: row.user.lifetimeStats?.currentGrade ?? null,
        displayName: row.user.displayName,
        id: row.user.id,
      },
    }
  }

  async findFeatured(input: { language?: string; limit: number }): Promise<FeaturedReplayRow[]> {
    const rows = await this._prisma.hallOfFameEntry.findMany({
      include: {
        language: { select: { slug: true } },
        playSession: {
          select: { accuracy: true, id: true, score: true, typedChars: true },
        },
        user: {
          include: { lifetimeStats: { select: { currentGrade: true } } },
        },
      },
      orderBy: { commentSubmittedAt: "desc" },
      take: input.limit,
      where: {
        comment: { not: null },
        commentSubmittedAt: { not: null },
        language: input.language ? { slug: input.language } : undefined,
        user: { canPublicRanking: true },
      },
    })

    return rows.flatMap((row) => {
      /**
       * where 条件で comment / commentSubmittedAt の non-null は保証されているが、
       * TypeScript の型推論は narrowing しないため明示チェックで絞る
       */
      if (row.comment === null || row.commentSubmittedAt === null) return []
      return [{
        comment: row.comment,
        commentSubmittedAt: row.commentSubmittedAt,
        language: { slug: row.language.slug },
        playSession: {
          accuracy: row.playSession.accuracy,
          id: row.playSession.id,
          score: row.playSession.score,
          typedChars: row.playSession.typedChars,
        },
        user: {
          avatarUrl: row.user.avatarUrl,
          currentGrade: row.user.lifetimeStats?.currentGrade ?? null,
          displayName: row.user.displayName,
          id: row.user.id,
        },
      }]
    })
  }
}
