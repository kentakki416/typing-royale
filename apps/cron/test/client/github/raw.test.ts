import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getRawContent } from "../../../src/client/github/raw"

describe("getRawContent", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("正常系", () => {
    it("raw.githubusercontent.com からテキスト本文を取得する", async () => {
      const body = "function foo() { return 1 }"
      vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status: 200 }))

      const result = await getRawContent("colinhacks", "zod", "abc123", "src/parse.ts")

      expect(result).toBe(body)
      expect(vi.mocked(fetch).mock.calls[0][0])
        .toBe("https://raw.githubusercontent.com/colinhacks/zod/abc123/src/parse.ts")
    })
  })

  describe("異常系", () => {
    it("HTTP 404 は GithubApiError(404) として throw", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("Not Found", { status: 404 }))

      await expect(
        getRawContent("colinhacks", "zod", "abc", "deleted.ts")
      ).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
