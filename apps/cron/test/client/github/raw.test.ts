import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GithubClient } from "../../../src/client/github/client"

const newClient = (): GithubClient =>
  new GithubClient({ pat: "test-pat", minStars: 1000, pushedAfter: "2024-06-01" })

describe("GithubClient.getRawContent", () => {
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

      const result = await newClient().getRawContent("colinhacks", "zod", "abc123", "src/parse.ts")

      expect(result).toBe(body)
      expect(vi.mocked(fetch).mock.calls[0][0])
        .toBe("https://raw.githubusercontent.com/colinhacks/zod/abc123/src/parse.ts")
    })

    it("Accept ヘッダは送らないが Authorization / User-Agent は送る", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("ok", { status: 200 }))

      await newClient().getRawContent("o", "r", "sha", "src/index.ts")

      const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
      const headers = init.headers as Record<string, string>
      expect(headers["Authorization"]).toBe("Bearer test-pat")
      expect(headers["User-Agent"]).toBe("typing-royale-crawler/1.0")
      expect(headers["Accept"]).toBeUndefined()
    })
  })

  describe("異常系", () => {
    it("HTTP 404 は GithubApiError(404) として throw", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("Not Found", { status: 404 }))

      await expect(
        newClient().getRawContent("colinhacks", "zod", "abc", "deleted.ts")
      ).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
