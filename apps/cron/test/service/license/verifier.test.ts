import { beforeEach, describe, expect, it, vi } from "vitest"

import { type GithubClient, type GithubRepoMeta , GithubApiError } from "../../../src/client/github"
import type {
  CrawledRepoDomain,
  CrawledRepoRepository,
  ProblemRepository,
} from "../../../src/repository/prisma"
import { licenseRecheck } from "../../../src/service/license/verifier"

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
  markDisabled: vi.fn(async () => undefined),
  ...overrides,
})

const buildProblemRepo = (overrides: Partial<ProblemRepository> = {}): ProblemRepository => ({
  bulkCreateSkippingDuplicates: vi.fn(async () => 0),
  markDisabledByCrawledRepoId: vi.fn(async () => 0),
  ...overrides,
})

const repoDomain = (id: number, fullName: string, license = "MIT"): CrawledRepoDomain => {
  const [owner, name] = fullName.split("/")
  return { id, commitSha: "sha", fullName, languageId: 1, license, name, owner }
}

const buildMeta = (license: string | null): GithubRepoMeta => ({
  id: 100,
  commitSha: "sha",
  defaultBranch: "main",
  description: null,
  fullName: "o/r",
  homepage: null,
  license,
  name: "r",
  owner: "o",
  stars: 0,
  topics: [],
})

describe("licenseRecheck", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ライセンス OK の repo は markDisabled を呼ばない", async () => {
      const crawledRepoRepository = buildCrawledRepoRepo({
        listForLicenseRecheck: vi.fn(async () => [repoDomain(1, "a/x"), repoDomain(2, "b/y")]),
      })
      const github = buildGithub({ getRepoMeta: vi.fn(async () => buildMeta("MIT")) })
      const problemRepository = buildProblemRepo()

      const result = await licenseRecheck({ crawledRepoRepository, github, problemRepository })

      expect(result).toEqual({ disabledProblems: 0, disabledRepos: 0, reposProcessed: 2 })
      expect(crawledRepoRepository.markDisabled).not.toHaveBeenCalled()
      expect(problemRepository.markDisabledByCrawledRepoId).not.toHaveBeenCalled()
    })

    it("ライセンス NG の repo は markDisabled と markDisabledByCrawledRepoId を呼ぶ", async () => {
      const crawledRepoRepository = buildCrawledRepoRepo({
        listForLicenseRecheck: vi.fn(async () => [repoDomain(1, "a/x")]),
      })
      const github = buildGithub({ getRepoMeta: vi.fn(async () => buildMeta("GPL-3.0")) })
      const problemRepository = buildProblemRepo({
        markDisabledByCrawledRepoId: vi.fn(async () => 25),
      })

      const result = await licenseRecheck({ crawledRepoRepository, github, problemRepository })

      expect(result).toEqual({ disabledProblems: 25, disabledRepos: 1, reposProcessed: 1 })
      expect(crawledRepoRepository.markDisabled).toHaveBeenCalledWith(1, "license_changed")
      expect(problemRepository.markDisabledByCrawledRepoId).toHaveBeenCalledWith(1)
    })

    it("ライセンス null（GitHub が判別不能）でも disabled 扱いになる", async () => {
      const crawledRepoRepository = buildCrawledRepoRepo({
        listForLicenseRecheck: vi.fn(async () => [repoDomain(1, "a/x")]),
      })
      const github = buildGithub({ getRepoMeta: vi.fn(async () => buildMeta(null)) })
      const problemRepository = buildProblemRepo({
        markDisabledByCrawledRepoId: vi.fn(async () => 10),
      })

      const result = await licenseRecheck({ crawledRepoRepository, github, problemRepository })

      expect(result).toMatchObject({ disabledRepos: 1, disabledProblems: 10 })
    })
  })

  describe("異常系", () => {
    it("個別 repo の 404 は他の repo を止めず継続する", async () => {
      const crawledRepoRepository = buildCrawledRepoRepo({
        listForLicenseRecheck: vi.fn(async () => [
          repoDomain(1, "a/x"),
          repoDomain(2, "b/y"),
          repoDomain(3, "c/z"),
        ]),
      })
      const github = buildGithub({
        getRepoMeta: vi.fn(async (owner) => {
          if (owner === "b") throw new GithubApiError(404, "Not Found")
          return buildMeta("MIT")
        }),
      })
      const problemRepository = buildProblemRepo()

      const result = await licenseRecheck({ crawledRepoRepository, github, problemRepository })

      /** b/y は失敗（disabled 化されない）が、a/x と c/z は処理される */
      expect(result.reposProcessed).toBe(3)
      expect(result.disabledRepos).toBe(0)
      expect(crawledRepoRepository.markDisabled).not.toHaveBeenCalled()
    })
  })
})
