import type { PrismaClient } from "@repo/db"

/**
 * `crawler_runs` テーブルの Repository。
 *
 * 1 回の cron 実行に対応する親レコード。同日二重起動防止と stale running の
 * 自動 failed 化を担う。同日判定は **JST 00:00 起点**（now を引数で受けてテスト
 * 時の clock DI を可能にする）。
 */

export type CreateRunInput = {
  runType: "full" | "license_recheck"
  startedAt: Date
}

export interface CrawlerRunRepository {
  /** 同日（JST 00:00 起点）に status="running" / "success" の行があるか */
  existsActiveRunToday: (runType: string, now: Date) => Promise<boolean>
  /** started_at < now - 30min の running 行を failed に一括更新。戻り値は更新件数 */
  markStaleAsFailed: (runType: string, now: Date) => Promise<number>
  start: (input: CreateRunInput) => Promise<{ id: number }>
  succeed: (
    id: number,
    endedAt: Date,
    reposProcessed: number,
    problemsAdded: number
  ) => Promise<void>
  fail: (id: number, endedAt: Date, error: unknown) => Promise<void>
}

const STALE_THRESHOLD_MS = 30 * 60 * 1000

/**
 * JST 00:00 起点の「今日の開始時刻」を UTC Date で返す。
 * Postgres TIMESTAMPTZ との比較は UTC で済むので、ここで JST → UTC に正規化する。
 */
const startOfTodayJst = (now: Date): Date => {
  const jstOffsetMs = 9 * 60 * 60 * 1000
  const jstMidnight = new Date(Math.floor((now.getTime() + jstOffsetMs) / 86_400_000) * 86_400_000)
  return new Date(jstMidnight.getTime() - jstOffsetMs)
}

const errorToJson = (error: unknown): { message: string; name?: string; stack?: string } => {
  if (error instanceof Error) return { message: error.message, name: error.name, stack: error.stack }
  return { message: String(error) }
}

export class PrismaCrawlerRunRepository implements CrawlerRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  existsActiveRunToday = async (runType: string, now: Date): Promise<boolean> => {
    const from = startOfTodayJst(now)
    const row = await this.prisma.crawlerRun.findFirst({
      select: { id: true },
      where: {
        runType,
        startedAt: { gte: from },
        status: { in: ["running", "success"] },
      },
    })
    return row !== null
  }

  markStaleAsFailed = async (runType: string, now: Date): Promise<number> => {
    const threshold = new Date(now.getTime() - STALE_THRESHOLD_MS)
    const result = await this.prisma.crawlerRun.updateMany({
      data: {
        endedAt: now,
        error: { reason: "stale_running" },
        status: "failed",
      },
      where: {
        runType,
        startedAt: { lt: threshold },
        status: "running",
      },
    })
    return result.count
  }

  start = async (input: CreateRunInput): Promise<{ id: number }> => {
    const row = await this.prisma.crawlerRun.create({
      data: {
        runType: input.runType,
        startedAt: input.startedAt,
        status: "running",
      },
      select: { id: true },
    })
    return { id: row.id }
  }

  succeed = async (
    id: number,
    endedAt: Date,
    reposProcessed: number,
    problemsAdded: number
  ): Promise<void> => {
    await this.prisma.crawlerRun.update({
      data: { endedAt, problemsAdded, reposProcessed, status: "success" },
      where: { id },
    })
  }

  fail = async (id: number, endedAt: Date, error: unknown): Promise<void> => {
    await this.prisma.crawlerRun.update({
      data: { endedAt, error: errorToJson(error), status: "failed" },
      where: { id },
    })
  }
}
