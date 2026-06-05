import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GithubClient } from "../../../src/client/github/client"

const loadFixture = (name: string): string =>
  readFileSync(join(__dirname, "../../fixtures/github", name), "utf-8")

const okResponse = (bodyJson: string): Response =>
  new Response(bodyJson, { status: 200 })

const newClient = (): GithubClient =>
  new GithubClient({ pat: "test-pat", minStars: 1000, pushedAfter: "2024-06-01" })

describe("GithubClient.getRepoMeta", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("正常系", () => {
    it("repo 情報と HEAD commit SHA を統合して返す", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(okResponse(loadFixture("repos-colinhacks-zod.json")))
        .mockResolvedValueOnce(okResponse(loadFixture("refs-heads-main.json")))

      const meta = await newClient().getRepoMeta("colinhacks", "zod")

      expect(meta).toEqual({
        id: 123,
        commitSha: "abc123def456789012345678901234567890abcd",
        defaultBranch: "main",
        description: "TypeScript-first schema validation with static type inference",
        fullName: "colinhacks/zod",
        homepage: "https://zod.dev",
        license: "MIT",
        name: "zod",
        owner: "colinhacks",
        stars: 35000,
        topics: ["typescript", "schema", "validation", "type-safety"],
      })
    })

    it("license が null の repo は license: null になる", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(okResponse(loadFixture("repos-license-null.json")))
        .mockResolvedValueOnce(okResponse(loadFixture("refs-heads-main.json")))

      const meta = await newClient().getRepoMeta("someone", "no-license")
      expect(meta.license).toBeNull()
    })

    it("topics が undefined の古い repo でも空配列が返る", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(okResponse(loadFixture("repos-topics-undefined.json")))
        .mockResolvedValueOnce(okResponse(loadFixture("refs-heads-main.json")))

      const meta = await newClient().getRepoMeta("old", "repo")
      expect(meta.topics).toEqual([])
    })

    it("repo 取得と commit SHA 取得で 2 回 fetch される", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(okResponse(loadFixture("repos-colinhacks-zod.json")))
        .mockResolvedValueOnce(okResponse(loadFixture("refs-heads-main.json")))

      await newClient().getRepoMeta("colinhacks", "zod")

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://api.github.com/repos/colinhacks/zod")
      expect(vi.mocked(fetch).mock.calls[1][0])
        .toBe("https://api.github.com/repos/colinhacks/zod/git/refs/heads/main")
    })
  })

  describe("異常系", () => {
    it("HTTP 404 は GithubApiError(404) として throw（disable 候補）", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("Not Found", { status: 404 }))

      await expect(newClient().getRepoMeta("foo", "missing")).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })
})
