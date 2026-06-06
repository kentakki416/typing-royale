import type { PrismaClient } from "@repo/db"

/**
 * `crawler_runs` テーブルの Repository。
 *
 * 1 回の cron 実行に対応するレコード。
 * 実行履歴の記録と、orphan running 行のクリーンアップを担う。
 *
 * orphan running は以下のケースで発生する：
 *   - start() の INSERT は成功したが、レスポンスがネットワーク障害で届かない
 *   - succeed() / fail() の UPDATE が失敗（fail() は task 側で握り潰さない方針なので process.exit へ）
 *   - OOM / SIGKILL で task プロセスが落ちる
 *
 * これらを次回 run の冒頭で markStaleAsFailed で掃除する。問題プール（problems / crawled_repos）
 * 自体は別の Repository 呼び出しで進むためべき等で壊れない。crawler_runs はあくまで観測用。
 */

const STALE_THRESHOLD_MS = 30 * 60 * 1000

export type CreateRunInput = {
  /** 例: "crawler_typescript" / "license_recheck"。task ごとにハードコードする（新言語追加時は "crawler_<slug>"） */
  runType: string
  startedAt: Date
}

export interface CrawlerRunRepository {
  /**
   * 30 分以上前から status="running" のままの行を "failed" に倒し、件数を返す。
   * task の start() 直前で呼ぶ。失敗時の救済目的なので失敗しても継続させたい
   * （呼び出し側で try/catch するかは判断）。
   */
  markStaleAsFailed: (runType: string) => Promise<number>
  start: (input: CreateRunInput) => Promise<{ id: number }>
  succeed: (
    id: number,
    endedAt: Date,
    reposProcessed: number,
    problemsAdded: number
  ) => Promise<void>
  fail: (id: number, endedAt: Date, error: unknown) => Promise<void>
}

const errorToJson = (error: unknown): { message: string; name?: string; stack?: string } => {
  if (error instanceof Error) return { message: error.message, name: error.name, stack: error.stack }
  return { message: String(error) }
}

export class PrismaCrawlerRunRepository implements CrawlerRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  markStaleAsFailed = async (runType: string): Promise<number> => {
    const now = new Date()
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
