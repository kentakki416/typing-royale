import type { PrismaClient } from "@repo/db"

/**
 * `problems` テーブルへの書き込み Repository。
 *
 * 主な用途:
 *   - クローラが採用候補を bulk INSERT する（`bulkCreateSkippingDuplicates`）
 *   - ライセンス再検証で disabled になった repo の problems を一括無効化する
 *     （`markDisabledByCrawledRepoId`）
 *
 * read 操作（出題用の find / sample）は今後 Web/API 側で扱うので、ここには含まない。
 */

export type CreateProblemInput = {
  astHash: string
  charCount: number
  codeBlock: string
  crawledRepoId: number
  functionName: string
  languageId: number
  lineCount: number
  sourceFilePath: string
  sourceLineEnd: number
  sourceLineStart: number
  sourceUrl: string
}

export interface ProblemRepository {
  /**
   * `@@unique([languageId, astHash])` に違反した行は skip し、挿入件数だけ返す。
   *
   * 同 repo 内の重複は service 層で事前に Map dedupe するため、ここで弾かれるのは
   * 「他 repo に既に同 hash が存在する」ケースのみ。
   */
  bulkCreateSkippingDuplicates: (inputs: CreateProblemInput[]) => Promise<number>
  /**
   * ライセンス再検証で disabled になった repo の problems を一括 disabled 化。
   * 戻り値は更新件数。
   */
  markDisabledByCrawledRepoId: (crawledRepoId: number) => Promise<number>
}

export class PrismaProblemRepository implements ProblemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  bulkCreateSkippingDuplicates = async (inputs: CreateProblemInput[]): Promise<number> => {
    if (inputs.length === 0) return 0
    const result = await this.prisma.problem.createMany({
      data: inputs.map((p) => ({
        astHash: p.astHash,
        charCount: p.charCount,
        codeBlock: p.codeBlock,
        crawledRepoId: p.crawledRepoId,
        functionName: p.functionName,
        languageId: p.languageId,
        lineCount: p.lineCount,
        sourceFilePath: p.sourceFilePath,
        sourceLineEnd: p.sourceLineEnd,
        sourceLineStart: p.sourceLineStart,
        sourceUrl: p.sourceUrl,
      })),
      skipDuplicates: true,
    })
    return result.count
  }

  markDisabledByCrawledRepoId = async (crawledRepoId: number): Promise<number> => {
    const result = await this.prisma.problem.updateMany({
      data: { disabled: true },
      where: { crawledRepoId, disabled: false },
    })
    return result.count
  }
}
