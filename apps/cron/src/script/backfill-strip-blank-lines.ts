import { createPrismaClient, type PrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { removeBlankLines } from "../ast/remove-blank-lines"
import { env } from "../env"

/**
 * 一度きりのバックフィルスクリプト（実行後に削除する想定）。
 *
 * クローラーの空行除去（PR #248）は「これから保存される問題」にしか効かない。
 * すでに `problems` に保存済みの `code_block` に対して removeBlankLines を後追いで
 * 適用して空行を詰め、あわせて char_count / line_count を整形後の値へ再計算する。
 *
 * astHash は空白を無視して計算されるため（normalize-for-hash）この整形では変化せず、
 * `@@unique([languageId, astHash])` 制約に触れない。disabled / プレイ履歴 / ランキングは
 * 一切触らない（既存行の中身だけを書き換える非破壊的な更新）。冪等なので再実行しても安全。
 *
 * 実行:
 *   ローカル : pnpm backfill:strip-blank-lines -- --dry-run   （件数だけ確認）
 *             pnpm backfill:strip-blank-lines                 （本実行）
 *   prd     : ECS run-task の command override で
 *             node dist/script/backfill-strip-blank-lines.js [--dry-run]
 */

const BATCH_SIZE = 500

const main = async (): Promise<void> => {
  const dryRun = process.argv.includes("--dry-run")
  const prisma: PrismaClient = createPrismaClient({ url: env.DATABASE_URL })

  let scanned = 0
  let updated = 0
  let cursorId = 0

  try {
    logger.info("backfill: start", { dryRun })
    for (;;) {
      const rows = await prisma.problem.findMany({
        orderBy: { id: "asc" },
        select: { id: true, codeBlock: true },
        take: BATCH_SIZE,
        where: { id: { gt: cursorId } },
      })
      if (rows.length === 0) break

      for (const row of rows) {
        scanned++
        cursorId = row.id
        const stripped = removeBlankLines(row.codeBlock).trim()
        if (stripped === row.codeBlock) continue
        updated++
        if (dryRun) continue
        await prisma.problem.update({
          data: {
            charCount: stripped.length,
            codeBlock: stripped,
            lineCount: stripped.split("\n").length,
          },
          where: { id: row.id },
        })
      }
      logger.info("backfill: progress", { scanned, updated })
    }
    logger.info("backfill: done", { dryRun, scanned, updated })
  } finally {
    await prisma.$disconnect()
  }
}

void main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error("backfill failed", err instanceof Error ? err : new Error(String(err)))
    process.exit(1)
  })
