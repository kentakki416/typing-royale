import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseRateLimit, waitForRateLimit } from "../../../src/client/github/rate-limit"

describe("parseRateLimit", () => {
  describe("正常系", () => {
    it("X-RateLimit-Remaining と X-RateLimit-Reset から状態を組み立てる", () => {
      const headers = new Headers({
        "X-RateLimit-Remaining": "42",
        "X-RateLimit-Reset": "1748390400",
      })
      const state = parseRateLimit(headers)
      expect(state).not.toBeNull()
      expect(state?.remaining).toBe(42)
      expect(state?.reset.getTime()).toBe(1748390400 * 1000)
    })
  })

  describe("異常系", () => {
    it("X-RateLimit-Remaining が無ければ null を返す", () => {
      const headers = new Headers({ "X-RateLimit-Reset": "1748390400" })
      expect(parseRateLimit(headers)).toBeNull()
    })

    it("X-RateLimit-Reset が無ければ null を返す", () => {
      const headers = new Headers({ "X-RateLimit-Remaining": "42" })
      expect(parseRateLimit(headers)).toBeNull()
    })

    it("両方無ければ null を返す", () => {
      expect(parseRateLimit(new Headers())).toBeNull()
    })
  })
})

describe("waitForRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("正常系", () => {
    it("remaining > 0 なら待機せず即 resolve", async () => {
      const state = { remaining: 100, reset: new Date(Date.now() + 60_000) }
      await expect(waitForRateLimit(state)).resolves.toBeUndefined()
    })

    it("reset 時刻が過去なら待機せず即 resolve", async () => {
      const state = { remaining: 0, reset: new Date(Date.now() - 1000) }
      await expect(waitForRateLimit(state)).resolves.toBeUndefined()
    })

    it("remaining=0 で reset まで待機する（1 分後）", async () => {
      const state = { remaining: 0, reset: new Date(Date.now() + 60_000) }
      const promise = waitForRateLimit(state)
      await vi.advanceTimersByTimeAsync(60_000)
      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe("異常系", () => {
    it("待機が MAX_WAIT_MS（30 分）を超える場合は throw する", async () => {
      const state = { remaining: 0, reset: new Date(Date.now() + 31 * 60_000) }
      await expect(waitForRateLimit(state)).rejects.toThrow(/exceeds max wait/)
    })
  })
})
