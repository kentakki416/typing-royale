import { PrismaClient } from "@repo/db"

import { PlaySessionProblem } from "../../types/domain"

/**
 * Problem リポジトリのインターフェース
 *
 * step2 では `/solo` の問題抽選のみ。書き込みは apps/cron 側の責務
 */
export interface ProblemRepository {
    /**
     * 指定 repo から disabled=false の problems を最大 limit 件ランダム抽選
     * orderIndex は呼び出し側で 0..limit-1 を連番付与する
     */
    pickRandomByCrawledRepoId(crawledRepoId: number, limit: number): Promise<PlaySessionProblem[]>
}

/**
 * Prisma 実装の Problem リポジトリ
 */
export class PrismaProblemRepository implements ProblemRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async pickRandomByCrawledRepoId(
    crawledRepoId: number,
    limit: number,
  ): Promise<PlaySessionProblem[]> {
    const rows = await this._prisma.$queryRaw<Array<{
            id: number
            char_count: number
            code_block: string
            function_name: string
            line_count: number
            source_url: string
        }>>`
      SELECT id, char_count, code_block, function_name, line_count, source_url
      FROM problems
      WHERE crawled_repo_id = ${crawledRepoId} AND disabled = false
      ORDER BY random()
      LIMIT ${limit}
    `
    return rows.map((row) => ({
      charCount: row.char_count,
      codeBlock: row.code_block,
      functionName: row.function_name,
      id: row.id,
      lineCount: row.line_count,
      orderIndex: 0,
      sourceUrl: row.source_url,
    }))
  }
}
