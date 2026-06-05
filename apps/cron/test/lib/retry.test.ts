import { describe, expect, it, vi } from "vitest"

import { retryWithBackoff } from "../../src/lib/retry"

const alwaysRetry = (_e: unknown) => true
const neverRetry = (_e: unknown) => false

describe("retryWithBackoff", () => {
  describe("正常系", () => {
    it("1 回目で成功すれば fn は 1 回だけ呼ばれる", async () => {
      const fn = vi.fn<() => Promise<string>>().mockResolvedValue("ok")
      const result = await retryWithBackoff(fn, alwaysRetry, { baseMs: 0 })
      expect(result).toBe("ok")
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("1 回目失敗 → 2 回目成功で fn は 2 回呼ばれて結果を返す", async () => {
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce("ok")
      const result = await retryWithBackoff(fn, alwaysRetry, { baseMs: 0 })
      expect(result).toBe("ok")
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe("異常系", () => {
    it("maxAttempts 回連続失敗で最後のエラーを throw する", async () => {
      const finalErr = new Error("last")
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("1"))
        .mockRejectedValueOnce(new Error("2"))
        .mockRejectedValueOnce(finalErr)
      await expect(
        retryWithBackoff(fn, alwaysRetry, { baseMs: 0, maxAttempts: 3 })
      ).rejects.toBe(finalErr)
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it("shouldRetry=false なら 1 回で即 throw して再試行しない", async () => {
      const err = new Error("hard")
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryWithBackoff(fn, neverRetry, { baseMs: 0 })).rejects.toBe(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("shouldRetry が途中で false を返したらそこで止まる", async () => {
      const retryable = new Error("retry")
      const fatal = new Error("fatal")
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(retryable)
        .mockRejectedValueOnce(fatal)
      const shouldRetry = (e: unknown) => e === retryable
      await expect(retryWithBackoff(fn, shouldRetry, { baseMs: 0 })).rejects.toBe(fatal)
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})
