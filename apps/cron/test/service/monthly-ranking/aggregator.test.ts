import { describe, expect, it, vi } from "vitest"

import type { MonthlyRankingRow, MonthlyRankingSnapshotRepository } from "../../../src/repository/prisma"
import { currentMonthJst, MonthlyRankingAggregator } from "../../../src/service/monthly-ranking/aggregator"

const buildRepo = (
  overrides: Partial<MonthlyRankingSnapshotRepository> = {}
): MonthlyRankingSnapshotRepository => ({
  aggregateCurrentMonth: vi.fn(async () => []),
  upsertMany: vi.fn(async () => undefined),
  ...overrides,
})

const makeRow = (overrides: Partial<MonthlyRankingRow> = {}): MonthlyRankingRow => ({
  accuracy: 0.95,
  languageId: 1,
  playedAt: new Date("2026-06-10T03:00:00Z"),
  rank: 1,
  score: 250,
  userId: 1,
  yearMonth: "2026-06",
  ...overrides,
})

describe("currentMonthJst", () => {
  describe("正常系", () => {
    it("月中の UTC 時刻から JST 暦月の境界を返す", () => {
      /** 2026-06-15 12:00:00 UTC = 2026-06-15 21:00 JST */
      const result = currentMonthJst(new Date("2026-06-15T12:00:00Z"))
      expect(result.yearMonth).toBe("2026-06")
      expect(result.monthStartJst).toBe("2026-06-01 00:00:00")
      expect(result.monthEndJst).toBe("2026-07-01 00:00:00")
    })

    it("12 月の場合、翌年 1 月初を end として返す", () => {
      /** 2026-12-31 12:00:00 UTC = 2026-12-31 21:00 JST */
      const result = currentMonthJst(new Date("2026-12-31T12:00:00Z"))
      expect(result.yearMonth).toBe("2026-12")
      expect(result.monthStartJst).toBe("2026-12-01 00:00:00")
      expect(result.monthEndJst).toBe("2027-01-01 00:00:00")
    })

    it("UTC 23:00 でも JST に変換すると翌日 8 時のため翌月にズレない", () => {
      /** 2026-06-30 23:00:00 UTC = 2026-07-01 08:00 JST → JST では 7 月 */
      const result = currentMonthJst(new Date("2026-06-30T23:00:00Z"))
      expect(result.yearMonth).toBe("2026-07")
    })

    it("UTC 14:00 で JST 23 時 = 同月の最終日", () => {
      /** 2026-06-30 14:00:00 UTC = 2026-06-30 23:00 JST → JST では 6 月最終日 */
      const result = currentMonthJst(new Date("2026-06-30T14:00:00Z"))
      expect(result.yearMonth).toBe("2026-06")
    })
  })
})

describe("MonthlyRankingAggregator", () => {
  describe("正常系", () => {
    it("集計結果を upsertMany に渡し、languagesProcessed と rowsUpserted を返す", async () => {
      const rows: MonthlyRankingRow[] = [
        makeRow({ languageId: 1, rank: 1, score: 300, userId: 1 }),
        makeRow({ languageId: 1, rank: 2, score: 250, userId: 2 }),
        makeRow({ languageId: 2, rank: 1, score: 200, userId: 1 }),
      ]
      const repo = buildRepo({
        aggregateCurrentMonth: vi.fn(async () => rows),
      })
      const aggregator = new MonthlyRankingAggregator(repo)

      const result = await aggregator.run(new Date("2026-06-15T12:00:00Z"))

      expect(result.yearMonth).toBe("2026-06")
      expect(result.languagesProcessed).toBe(2)
      expect(result.rowsUpserted).toBe(3)
      expect(repo.upsertMany).toHaveBeenCalledWith(rows, "2026-06")
    })

    it("集計結果が空でも upsertMany を呼び (差分削除のため)、rowsUpserted=0 を返す", async () => {
      const repo = buildRepo({
        aggregateCurrentMonth: vi.fn(async () => []),
      })
      const aggregator = new MonthlyRankingAggregator(repo)

      const result = await aggregator.run(new Date("2026-06-15T12:00:00Z"))

      expect(result.rowsUpserted).toBe(0)
      expect(result.languagesProcessed).toBe(0)
      expect(repo.upsertMany).toHaveBeenCalledWith([], "2026-06")
    })
  })

  describe("異常系", () => {
    it("aggregateCurrentMonth が throw したら run も throw する", async () => {
      const repo = buildRepo({
        aggregateCurrentMonth: vi.fn(async () => {
          throw new Error("db down")
        }),
      })
      const aggregator = new MonthlyRankingAggregator(repo)

      await expect(aggregator.run(new Date("2026-06-15T12:00:00Z"))).rejects.toThrow()
    })
  })
})
