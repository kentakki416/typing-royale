import { describe, expect, it, vi } from "vitest"

import { retryWithBackoff } from "../../src/lib/retry"

class StatusError extends Error {
  constructor(public statusCode: number) {
    super(`status ${statusCode}`)
  }
}

describe("retryWithBackoff", () => {
  describe("正常系", () => {
    it("1 回目で成功すれば fn は 1 回だけ呼ばれる", async () => {
      const fn = vi.fn<() => Promise<string>>().mockResolvedValue("ok")
      const result = await retryWithBackoff(fn, { baseMs: 0 })
      expect(result).toBe("ok")
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("statusCode 503 のエラー → 2 回目成功で fn は 2 回呼ばれる", async () => {
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new StatusError(503))
        .mockResolvedValueOnce("ok")
      const result = await retryWithBackoff(fn, { baseMs: 0 })
      expect(result).toBe("ok")
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it("境界値 statusCode 500 もリトライ対象", async () => {
      const fn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new StatusError(500))
        .mockResolvedValueOnce("ok")
      const result = await retryWithBackoff(fn, { baseMs: 0 })
      expect(result).toBe("ok")
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe("異常系", () => {
    it("statusCode 404 は即 throw（リトライしない）", async () => {
      const err = new StatusError(404)
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryWithBackoff(fn, { baseMs: 0 })).rejects.toBe(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("statusCode 401 / 403 は即 throw（認可エラーはリトライ不能）", async () => {
      for (const code of [401, 403]) {
        const err = new StatusError(code)
        const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
        await expect(retryWithBackoff(fn, { baseMs: 0 })).rejects.toBe(err)
        expect(fn).toHaveBeenCalledTimes(1)
      }
    })

    it("境界値 statusCode 499 は即 throw（< 500 はリトライしない）", async () => {
      const err = new StatusError(499)
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryWithBackoff(fn, { baseMs: 0 })).rejects.toBe(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("statusCode を持たないエラー（プレーン Error）は即 throw", async () => {
      const err = new Error("plain")
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryWithBackoff(fn, { baseMs: 0 })).rejects.toBe(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("statusCode が数値以外（文字列）の場合も即 throw", async () => {
      const err = Object.assign(new Error("weird"), { statusCode: "500" })
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err)
      await expect(retryWithBackoff(fn, { baseMs: 0 })).rejects.toBe(err)
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
        retryWithBackoff(fn, { baseMs: 0, maxAttempts: 3 })
      ).rejects.toBe(finalErr)
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })
})
