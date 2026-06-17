import { PrismaClient } from "@repo/db"

/**
 * 言語別オールタイムトップエントリ
 * typing-engine /challenge-gods が「神」を選ぶときに利用
 */
export type RankingTopEntry = {
    bestPlaySessionId: number
    bestScore: number
    userDisplay: {
        avatarUrl: string | null
        currentGrade: string
        githubUsername: string
    }
    userId: number
}

/**
 * RankingSnapshot リポジトリのインターフェース
 *
 * 言語別オールタイムトップ N を返す read-only Repository。
 * 命名は既存 interface 名を維持しているが、実体は `user_language_best` を
 * ORDER BY で読むリアルタイム集計（cron バッチ + snapshot テーブルは持たない）。
 * 命名の整理は将来の独立 PR で行う
 */
export interface RankingSnapshotRepository {
    /**
     * 言語別オールタイムトップ N を返す（score 降順 + tie-break）
     * MVP では N=10
     */
    getTopByLanguage(languageId: number, limit: number): Promise<RankingTopEntry[]>
}

/**
 * `user_language_best` を source とする Prisma 実装
 *
 * docs/spec/score-ranking/step2-api-rankings.md「既存 Stub の置き換え」参照
 */
export class PrismaRankingSnapshotRepository implements RankingSnapshotRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async getTopByLanguage(languageId: number, limit: number): Promise<RankingTopEntry[]> {
    const rows = await this._prisma.userLanguageBest.findMany({
      include: {
        user: {
          include: { lifetimeStats: { select: { currentGrade: true } } },
        },
      },
      orderBy: [
        { score: "desc" },
        { accuracy: "desc" },
        { playedAt: "asc" },
      ],
      take: limit,
      where: {
        languageId,
        user: { canPublicRanking: true },
      },
    })

    return rows.map((row) => ({
      bestPlaySessionId: row.bestPlaySessionId,
      bestScore: row.score,
      userDisplay: {
        avatarUrl: row.user.avatarUrl,
        currentGrade: row.user.lifetimeStats?.currentGrade ?? "intern",
        githubUsername: row.user.githubUsername ?? `user${row.user.id}`,
      },
      userId: row.user.id,
    }))
  }
}
