import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CrawlerRunRepository } from "../../../src/repository/prisma"
import { runWithCrawlerRunTracking } from "../../../src/service/crawler/run-tracker"

const buildRepo = (overrides: Partial<CrawlerRunRepository> = {}): CrawlerRunRepository => ({
  existsActiveRunToday: vi.fn(async () => false),
  fail: vi.fn(async () => undefined),
  markStaleAsFailed: vi.fn(async () => 0),
  start: vi.fn(async () => ({ id: 42 })),
  succeed: vi.fn(async () => undefined),
  ...overrides,
})

const FIXED_NOW = new Date("2026-06-05T03:00:00+09:00")

describe("runWithCrawlerRunTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("body の戻り値で succeed が呼ばれる", async () => {
      const repo = buildRepo()
      const body = vi.fn(async () => ({ problemsAdded: 12, reposProcessed: 3 }))

      await runWithCrawlerRunTracking("full", { crawlerRunRepository: repo }, body, {
        now: () => FIXED_NOW,
      })

      expect(repo.start).toHaveBeenCalledWith({ runType: "full", startedAt: FIXED_NOW })
      expect(body).toHaveBeenCalledWith(42)
      expect(repo.succeed).toHaveBeenCalledWith(42, FIXED_NOW, 3, 12)
      expect(repo.fail).not.toHaveBeenCalled()
    })

    it("stale running があれば markStaleAsFailed で自動 failed 化してから新 run を開始する", async () => {
      const repo = buildRepo({ markStaleAsFailed: vi.fn(async () => 2) })
      const body = vi.fn(async () => ({ problemsAdded: 0, reposProcessed: 0 }))

      await runWithCrawlerRunTracking("full", { crawlerRunRepository: repo }, body, {
        now: () => FIXED_NOW,
      })

      expect(repo.markStaleAsFailed).toHaveBeenCalledWith("full", FIXED_NOW)
      expect(repo.start).toHaveBeenCalled()
    })

    it("forceRerun=true なら同日 active があってもスキップしない", async () => {
      const repo = buildRepo({ existsActiveRunToday: vi.fn(async () => true) })
      const body = vi.fn(async () => ({ problemsAdded: 0, reposProcessed: 0 }))

      await runWithCrawlerRunTracking("full", { crawlerRunRepository: repo }, body, {
        forceRerun: true,
        now: () => FIXED_NOW,
      })

      expect(repo.existsActiveRunToday).not.toHaveBeenCalled()
      expect(repo.start).toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("同日 active があれば start を呼ばずに return（success 扱い、example: 例外スローしない）", async () => {
      const repo = buildRepo({ existsActiveRunToday: vi.fn(async () => true) })
      const body = vi.fn()

      await runWithCrawlerRunTracking("full", { crawlerRunRepository: repo }, body, {
        now: () => FIXED_NOW,
      })

      expect(repo.start).not.toHaveBeenCalled()
      expect(body).not.toHaveBeenCalled()
      expect(repo.succeed).not.toHaveBeenCalled()
      expect(repo.fail).not.toHaveBeenCalled()
    })

    it("body が throw したら fail を呼んでから rethrow する", async () => {
      const repo = buildRepo()
      const boom = new Error("boom")
      const body = vi.fn(async () => {
        throw boom
      })

      await expect(
        runWithCrawlerRunTracking("full", { crawlerRunRepository: repo }, body, {
          now: () => FIXED_NOW,
        })
      ).rejects.toBe(boom)

      expect(repo.fail).toHaveBeenCalledWith(42, FIXED_NOW, boom)
      expect(repo.succeed).not.toHaveBeenCalled()
    })
  })
})
