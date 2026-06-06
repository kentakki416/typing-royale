import { beforeEach, describe, expect, it, vi } from "vitest"

import type { GithubClient, GithubSearchItem } from "../../../src/client/github"
import type { CrawledRepoRepository } from "../../../src/repository/prisma"
import { pickNextRepo } from "../../../src/service/crawler/pick-next-repo"

const buildGithub = (overrides: Partial<GithubClient> = {}): GithubClient =>
  ({
    getRawContent: vi.fn(),
    getRepoMeta: vi.fn(),
    listSourceFiles: vi.fn(),
    searchRepos: vi.fn(),
    ...overrides,
  } as unknown as GithubClient)

const buildCrawledRepoRepo = (overrides: Partial<CrawledRepoRepository> = {}): CrawledRepoRepository => ({
  create: vi.fn(),
  listForLicenseRecheck: vi.fn(async () => []),
  listRegisteredFullNames: vi.fn(async () => new Set()),
  markDisabled: vi.fn(),
  ...overrides,
})

const searchItem = (fullName: string, stars = 1_000): GithubSearchItem => {
  const [owner, name] = fullName.split("/")
  return {
    id: stars,
    defaultBranch: "main",
    fullName,
    license: "MIT",
    name,
    owner,
    pushedAt: "2026-01-01",
    stars,
  }
}

describe("pickNextRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("登録済みをスキップして最初の未登録 repo を返す", async () => {
      const github = buildGithub({
        searchRepos: vi.fn(async () => ({
          items: [searchItem("a/x"), searchItem("b/y"), searchItem("c/z")],
          totalCount: 3,
        })),
      })
      const crawledRepoRepository = buildCrawledRepoRepo({
        listRegisteredFullNames: vi.fn(async () => new Set(["a/x"])),
      })

      const next = await pickNextRepo({ id: 1, slug: "typescript" }, { crawledRepoRepository }, { github })

      expect(next).toEqual({ name: "y", owner: "b" })
      expect(github.searchRepos).toHaveBeenCalledTimes(1)
    })

    it("1 ページ目が全て登録済みなら次ページを取りに行く", async () => {
      const github = buildGithub({
        searchRepos: vi.fn(async (_lang, page) => {
          if (page === 1) {
            const items = Array.from({ length: 100 }, (_, i) => searchItem(`p1/r${i}`))
            return { items, totalCount: 200 }
          }
          return { items: [searchItem("p2/fresh")], totalCount: 200 }
        }),
      })
      const allPage1 = new Set(Array.from({ length: 100 }, (_, i) => `p1/r${i}`))
      const crawledRepoRepository = buildCrawledRepoRepo({
        listRegisteredFullNames: vi.fn(async () => allPage1),
      })

      const next = await pickNextRepo({ id: 1, slug: "typescript" }, { crawledRepoRepository }, { github })

      expect(next).toEqual({ name: "fresh", owner: "p2" })
      expect(github.searchRepos).toHaveBeenCalledTimes(2)
    })

    it("Search 結果が 100 件未満（最終ページ）なら次ページを取りに行かない", async () => {
      const github = buildGithub({
        searchRepos: vi.fn(async () => ({
          items: [searchItem("a/x"), searchItem("b/y")],
          totalCount: 2,
        })),
      })
      const crawledRepoRepository = buildCrawledRepoRepo({
        listRegisteredFullNames: vi.fn(async () => new Set(["a/x", "b/y"])),
      })

      const next = await pickNextRepo({ id: 1, slug: "typescript" }, { crawledRepoRepository }, { github })

      expect(next).toBeNull()
      expect(github.searchRepos).toHaveBeenCalledTimes(1)
    })
  })

  describe("異常系", () => {
    it("最大 10 ページ × 100 件すべて登録済みなら null", async () => {
      const allRegistered = new Set<string>()
      for (let p = 1; p <= 10; p++) {
        for (let i = 0; i < 100; i++) allRegistered.add(`p${p}/r${i}`)
      }
      const github = buildGithub({
        searchRepos: vi.fn(async (_lang, page) => ({
          items: Array.from({ length: 100 }, (_, i) => searchItem(`p${page}/r${i}`)),
          totalCount: 1000,
        })),
      })
      const crawledRepoRepository = buildCrawledRepoRepo({
        listRegisteredFullNames: vi.fn(async () => allRegistered),
      })

      const next = await pickNextRepo({ id: 1, slug: "typescript" }, { crawledRepoRepository }, { github })

      expect(next).toBeNull()
      expect(github.searchRepos).toHaveBeenCalledTimes(10)
    })
  })
})
