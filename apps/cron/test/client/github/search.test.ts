import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GithubApiError } from "../../../src/client/github/errors"
import { searchRepos } from "../../../src/client/github/search"

const loadFixture = (name: string): string =>
  readFileSync(join(__dirname, "../../fixtures/github", name), "utf-8")

const okResponse = (bodyJson: string): Response =>
  new Response(bodyJson, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

describe("searchRepos", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("正常系", () => {
    it("fixture を読んで totalCount と items を整形して返す", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("search-typescript-page1.json")))

      const result = await searchRepos("typescript", 1, { minStars: 1000, pushedAfter: "2024-06-01" })

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

      await searchRepos("typescript", 1, { minStars: 1000, pushedAfter: "2024-06-01" })

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
  })

  describe("異常系", () => {
    it("HTTP 403 で GithubApiError(403) を throw", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("Forbidden", { status: 403 })
      )

      await expect(
        searchRepos("typescript", 1, { minStars: 1000, pushedAfter: "2024-06-01" })
      ).rejects.toThrow(GithubApiError)
    })

    it("ネットワークエラー（fetch が throw）は GithubApiError(599) に wrap される", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"))

      await expect(
        searchRepos("typescript", 1, { minStars: 1000, pushedAfter: "2024-06-01" })
      ).rejects.toMatchObject({ statusCode: 599 })
    })
  })
})
