import type { PrismaClient } from "@repo/db"

/**
 * `crawler_run_items` テーブルの Repository。
 *
 * CrawlerRun の子で、1 repo の試行を 1 行として記録する。連続失敗判定（Slack 通知）と
 * ブートストラップ時の途中失敗の特定に使う。
 */

export type CreateRunItemInput = {
  crawlerRunId: number
  languageId: number
  startedAt: Date
  targetOwner: string
  targetRepo: string
}

export interface CrawlerRunItemRepository {
  start: (input: CreateRunItemInput) => Promise<{ id: number }>
  succeed: (id: number, endedAt: Date, problemsAdded: number) => Promise<void>
  fail: (id: number, endedAt: Date, error: unknown) => Promise<void>
  skip: (id: number, endedAt: Date, reason: string) => Promise<void>
  /** 同 owner/repo の直近 2 件が failed か（連続失敗判定） */
  countConsecutiveFailures: (targetOwner: string, targetRepo: string) => Promise<number>
}

const errorToJson = (error: unknown): { message: string; name?: string; stack?: string } => {
  if (error instanceof Error) return { message: error.message, name: error.name, stack: error.stack }
  return { message: String(error) }
}

export class PrismaCrawlerRunItemRepository implements CrawlerRunItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  start = async (input: CreateRunItemInput): Promise<{ id: number }> => {
    const row = await this.prisma.crawlerRunItem.create({
      data: {
        crawlerRunId: input.crawlerRunId,
        languageId: input.languageId,
        startedAt: input.startedAt,
        status: "running",
        targetOwner: input.targetOwner,
        targetRepo: input.targetRepo,
      },
      select: { id: true },
    })
    return { id: row.id }
  }

  succeed = async (id: number, endedAt: Date, problemsAdded: number): Promise<void> => {
    await this.prisma.crawlerRunItem.update({
      data: { endedAt, problemsAdded, status: "success" },
      where: { id },
    })
  }

  fail = async (id: number, endedAt: Date, error: unknown): Promise<void> => {
    await this.prisma.crawlerRunItem.update({
      data: { endedAt, error: errorToJson(error), status: "failed" },
      where: { id },
    })
  }

  skip = async (id: number, endedAt: Date, reason: string): Promise<void> => {
    await this.prisma.crawlerRunItem.update({
      data: { endedAt, error: { reason }, status: "skipped" },
      where: { id },
    })
  }

  countConsecutiveFailures = async (targetOwner: string, targetRepo: string): Promise<number> => {
    const recent = await this.prisma.crawlerRunItem.findMany({
      orderBy: { startedAt: "desc" },
      select: { status: true },
      take: 2,
      where: { targetOwner, targetRepo },
    })
    if (recent.length < 2) return 0
    return recent.every((r) => r.status === "failed") ? 2 : 0
  }
}
