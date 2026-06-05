import { describe, expect, it, vi } from "vitest"

import { retryOnServerError, retryWithBackoff } from "../../src/lib/retry"

const alwaysRetry = (_e: unknown) => true
const neverRetry = (_e: unknown) => false

class StatusError extends Error {
  constructor(public statusCode: number) {
    super(`status ${statusCode}`)
  }
}

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

describe("retryOnServerError", () => {
  describe("正常系", () => {
    it("statusCode >= 500 のエラーはリトライする", async () => {
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new StatusError(503))
        .mockResolvedValueOnce("ok")
      const result = await retryOnServerError(fn, { baseMs: 0 })
      expect(result).toBe("ok")
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it("statusCode が境界値 500 でもリトライする", async () => {
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new StatusError(500))
        .mockResolvedValueOnce("ok")
      const result = await retryOnServerError(fn, { baseMs: 0 })
      expect(result).toBe("ok")
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe("異常系", () => {
    it("statusCode 404 は即 throw（リトライしない）", async () => {
      const err = new StatusError(404)
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryOnServerError(fn, { baseMs: 0 })).rejects.toBe(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("statusCode 401 / 403 は即 throw（認可エラーはリトライ不能）", async () => {
      for (const code of [401, 403]) {
        const err = new StatusError(code)
        const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
        await expect(retryOnServerError(fn, { baseMs: 0 })).rejects.toBe(err)
        expect(fn).toHaveBeenCalledTimes(1)
      }
    })

    it("statusCode 499 は即 throw（境界値、< 500 はリトライしない）", async () => {
      const err = new StatusError(499)
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryOnServerError(fn, { baseMs: 0 })).rejects.toBe(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("statusCode を持たないエラー（プレーン Error）は即 throw", async () => {
      const err = new Error("plain")
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryOnServerError(fn, { baseMs: 0 })).rejects.toBe(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("statusCode が数値以外（文字列）の場合も即 throw", async () => {
      const err = Object.assign(new Error("weird"), { statusCode: "500" })
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryOnServerError(fn, { baseMs: 0 })).rejects.toBe(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("maxAttempts 回連続で 5xx を返したら最後のエラーを throw", async () => {
      const finalErr = new StatusError(502)
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new StatusError(500))
        .mockRejectedValueOnce(new StatusError(503))
        .mockRejectedValueOnce(finalErr)
      await expect(
        retryOnServerError(fn, { baseMs: 0, maxAttempts: 3 })
      ).rejects.toBe(finalErr)
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })
})
