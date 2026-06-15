import { logger } from "@repo/logger"

import type { MonthlyRankingSnapshotRepository } from "../../repository/prisma"

export type RunResult = {
  languagesProcessed: number
  rowsUpserted: number
  yearMonth: string
}

/**
 * 月間ランキング集計の本体。
 *
 * 1. 起動時刻から JST 暦月の境界（月初・翌月初・"YYYY-MM"）を計算
 * 2. play_sessions を集計し、各 (年月, 言語) ごとに上位 10 位までの行を取得
 * 3. monthly_ranking_snapshots に UPSERT し、当月分のうち今回 result に含まれていない
 *    行を DELETE（順位入れ替わりに追従するため）
 *
 * 詳細仕様は docs/spec/monthly-ranking/README.md を参照
 */
export class MonthlyRankingAggregator {
  constructor(private readonly repo: MonthlyRankingSnapshotRepository) {}

  run = async (now: Date = new Date()): Promise<RunResult> => {
    const { monthEndJst, monthStartJst, yearMonth } = currentMonthJst(now)
    logger.info("MonthlyRankingAggregator: start", { monthEndJst, monthStartJst, yearMonth })

    const rows = await this.repo.aggregateCurrentMonth({
      monthEndJst,
      monthStartJst,
      yearMonth,
    })
    logger.info("MonthlyRankingAggregator: aggregated", { rowCount: rows.length, yearMonth })

    await this.repo.upsertMany(rows, yearMonth)

    const languagesProcessed = new Set(rows.map((r) => r.languageId)).size
    logger.info("MonthlyRankingAggregator: done", {
      languagesProcessed,
      rowsUpserted: rows.length,
      yearMonth,
    })

    return { languagesProcessed, rowsUpserted: rows.length, yearMonth }
  }
}

/**
 * 与えられた時刻が属する JST 暦月の境界を計算する純関数。
 *
 * - yearMonth: "YYYY-MM" 形式（snapshot.year_month に保存）
 * - monthStartJst: "YYYY-MM-DD HH:mm:ss" 形式の JST 月初
 * - monthEndJst:   "YYYY-MM-DD HH:mm:ss" 形式の JST 翌月初（end は exclusive）
 *
 * SQL 側で `AT TIME ZONE 'Asia/Tokyo'` で UTC に変換して比較するため、文字列のまま渡す
 */
export const currentMonthJst = (now: Date): { monthEndJst: string; monthStartJst: string; yearMonth: string } => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  )
  const yearNum = Number(parts.year)
  const monthNum = Number(parts.month)
  const yearMonth = `${parts.year}-${parts.month}`
  const monthStartJst = `${yearMonth}-01 00:00:00`
  const monthEndJst = monthNum === 12
    ? `${yearNum + 1}-01-01 00:00:00`
    : `${yearNum}-${String(monthNum + 1).padStart(2, "0")}-01 00:00:00`
  return { monthEndJst, monthStartJst, yearMonth }
}
