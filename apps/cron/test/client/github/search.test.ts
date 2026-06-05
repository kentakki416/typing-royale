import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GithubClient } from "../../../src/client/github/client"
import { GithubApiError } from "../../../src/client/github/errors"

const loadFixture = (name: string): string =>
  readFileSync(join(__dirname, "../../fixtures/github", name), "utf-8")

const okResponse = (bodyJson: string): Response =>
  new Response(bodyJson, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

const newClient = (): GithubClient =>
  new GithubClient({ pat: "test-pat", minStars: 1000, pushedAfter: "2024-06-01" })

describe("GithubClient.searchRepos", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("正常系", () => {
    it("fixture を読んで totalCount と items を整形して返す", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("search-typescript-page1.json")))

      const result = await newClient().searchRepos("typescript", 1)

      expect(result.totalCount).toBe(42)
      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toEqual({
        id: 123,
        defaultBranch: "main",
        fullName: "colinhacks/zod",
        license: "MIT",
        name: "zod",
        owner: "colinhacks",
        pushedAt: "2026-05-01T10:00:00Z",
        stars: 35000,
      })
    })

    it("クエリ文字列が language / license / stars / pushed / archived を含む", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("search-typescript-page1.json")))

      await newClient().searchRepos("typescript", 1)

      const call = vi.mocked(fetch).mock.calls[0]
      const url = call[0] as string
      const decoded = decodeURIComponent(url)
      expect(decoded).toContain("language:typescript")
      expect(decoded).toContain("license:mit")
      expect(decoded).toContain("license:apache-2.0")
      expect(decoded).toContain("license:bsd-3-clause")
      expect(decoded).toContain("license:isc")
      expect(decoded).toContain("stars:>=1000")
      expect(decoded).toContain("pushed:>2024-06-01")
      expect(decoded).toContain("archived:false")
      expect(url).toContain("sort=stars")
      expect(url).toContain("order=desc")
      expect(url).toContain("per_page=100")
      expect(url).toContain("page=1")
    })

    it("Authorization / User-Agent / X-GitHub-Api-Version ヘッダを送る", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("search-typescript-page1.json")))

      await newClient().searchRepos("typescript", 1)

      const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
      const headers = init.headers as Record<string, string>
      expect(headers["Authorization"]).toBe("Bearer test-pat")
      expect(headers["User-Agent"]).toBe("typing-royale-crawler/1.0")
      expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28")
    })

    it("pushedAfter 未指定時は実行日 - 2 年（YYYY-MM-DD）になる", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("search-typescript-page1.json")))

      const client = new GithubClient({ pat: "test-pat", minStars: 1000 })
      await client.searchRepos("typescript", 1)

      const url = vi.mocked(fetch).mock.calls[0][0] as string
      const decoded = decodeURIComponent(url)
      const match = decoded.match(/pushed:>(\d{4}-\d{2}-\d{2})/)
      expect(match).not.toBeNull()
    })
  })

  describe("異常系", () => {
    it("HTTP 403 で GithubApiError(403) を throw", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("Forbidden", { status: 403 })
      )

      await expect(newClient().searchRepos("typescript", 1)).rejects.toThrow(GithubApiError)
    })

    it("ネットワークエラー（fetch が throw）は GithubApiError(599) に wrap される", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"))

      await expect(newClient().searchRepos("typescript", 1)).rejects.toMatchObject({
        statusCode: 599,
      })
    })
  })
})
