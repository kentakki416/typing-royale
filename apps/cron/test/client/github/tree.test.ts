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

describe("GithubClient.listSourceFiles", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("正常系", () => {
    it("採用される .ts ファイルのみ返す（テスト・ノイズ・大ファイル・ディレクトリは除外）", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))

      const files = await newClient().listSourceFiles("owner", "repo", "sha")

      const paths = files.map((f) => f.path)
      expect(paths).toContain("src/index.ts")
      expect(paths).toContain("src/parse.ts")
      expect(paths).toContain("src/types.ts")
    })

    it("EXCLUDED_TREE_PATTERNS で .test.ts / .spec.ts / -test.ts を除外", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))
      const paths = (await newClient().listSourceFiles("o", "r", "s")).map((f) => f.path)
      expect(paths).not.toContain("src/utils.test.ts")
      expect(paths).not.toContain("src/parse.spec.ts")
      expect(paths).not.toContain("src/legacy-test.ts")
    })

    it("テストディレクトリ（__tests__ / tests / e2e / __mocks__）を除外", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))
      const paths = (await newClient().listSourceFiles("o", "r", "s")).map((f) => f.path)
      expect(paths).not.toContain("src/__tests__/helpers.ts")
      expect(paths).not.toContain("tests/integration.ts")
      expect(paths).not.toContain("e2e/login.spec.ts")
      expect(paths).not.toContain("src/__mocks__/api.ts")
    })

    it("Storybook / fixtures を除外", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))
      const paths = (await newClient().listSourceFiles("o", "r", "s")).map((f) => f.path)
      expect(paths).not.toContain("src/Button.stories.tsx")
      expect(paths).not.toContain("src/data.fixtures.ts")
    })

    it("依存・ビルド成果物 / .d.ts を除外", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))
      const paths = (await newClient().listSourceFiles("o", "r", "s")).map((f) => f.path)
      expect(paths).not.toContain("node_modules/lodash/index.js")
      expect(paths).not.toContain("dist/bundle.js")
      expect(paths).not.toContain("build/output.js")
      expect(paths).not.toContain("src/types.d.ts")
    })

    it("静的アセット / データディレクトリ（data / images / public）を除外", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))
      const paths = (await newClient().listSourceFiles("o", "r", "s")).map((f) => f.path)
      expect(paths).not.toContain("data/seeds.ts")
      expect(paths).not.toContain("images/logo.js")
      expect(paths).not.toContain("public/config.ts")
      expect(paths).not.toContain("src/data/seed.ts")
      expect(paths).not.toContain("src/images/icon.ts")
      expect(paths).not.toContain("src/public/static.ts")
    })

    it("100KB 超のファイルを除外", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))
      const paths = (await newClient().listSourceFiles("o", "r", "s")).map((f) => f.path)
      expect(paths).not.toContain("huge-bundle.js")
    })

    it("type=tree のエントリ（ディレクトリ）を除外", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))
      const files = await newClient().listSourceFiles("o", "r", "s")
      expect(files.every((f) => f.type === "blob")).toBe(true)
    })

    it("対象外拡張子（.md 等）を除外", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okResponse(loadFixture("tree-recursive.json")))
      const paths = (await newClient().listSourceFiles("o", "r", "s")).map((f) => f.path)
      expect(paths).not.toContain("README.md")
    })
  })

  describe("異常系", () => {
    it("HTTP 404 は GithubApiError(404) として throw", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
      await expect(newClient().listSourceFiles("o", "r", "s")).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })
})
