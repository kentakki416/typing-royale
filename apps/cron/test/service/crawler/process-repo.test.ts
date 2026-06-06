import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type GithubClient, type GithubRepoMeta, type GithubTreeEntry , GithubApiError } from "../../../src/client/github"
import type {
  CrawledRepoRepository,
  ProblemRepository,
} from "../../../src/repository/prisma"
import { processRepo } from "../../../src/service/crawler/process-repo"

/**
 * GithubClient は class だが、テストでは public メソッドだけ vi.fn() で差し替えた
 * ダックタイプを渡せば十分。private メソッドや constructor を呼ぶ必要はない。
 */
const buildGithub = (overrides: Partial<GithubClient> = {}): GithubClient =>
  ({
    getRawContent: vi.fn(),
    getRepoMeta: vi.fn(),
    listSourceFiles: vi.fn(),
    searchRepos: vi.fn(),
    ...overrides,
  } as unknown as GithubClient)

const buildCrawledRepoRepo = (overrides: Partial<CrawledRepoRepository> = {}): CrawledRepoRepository => ({
  create: vi.fn(async (input) => ({
    id: 999,
    commitSha: input.commitSha,
    fullName: input.fullName,
    languageId: input.languageId,
    license: input.license,
    name: input.name,
    owner: input.owner,
  })),
  listForLicenseRecheck: vi.fn(async () => []),
  listRegisteredFullNames: vi.fn(async () => new Set()),
  markDisabled: vi.fn(async () => undefined),
  ...overrides,
})

const buildProblemRepo = (overrides: Partial<ProblemRepository> = {}): ProblemRepository => ({
  bulkCreateSkippingDuplicates: vi.fn(async (inputs) => inputs.length),
  markDisabledByCrawledRepoId: vi.fn(async () => 0),
  ...overrides,
})

/** AST 解析対象の最小サンプル。MIN_CHAR_COUNT=100 / MIN_LINE_COUNT=5 を満たす関数 */
const buildSourceWithFunctions = (count: number): string => {
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    lines.push(
      `export function fn_${i}(value: string): string {`,
      "  const padded = value.padStart(40, \"*\")",
      "  const upper = padded.toUpperCase()",
      "  const lower = padded.toLowerCase()",
      `  return upper + lower + "_${i}"`,
      "}",
      ""
    )
  }
  return lines.join("\n")
}

const baseMeta: GithubRepoMeta = {
  id: 123,
  commitSha: "abc123",
  defaultBranch: "main",
  description: null,
  fullName: "o/r",
  homepage: null,
  license: "MIT",
  name: "r",
  owner: "o",
  stars: 1000,
  topics: [],
}

const fileEntry = (path: string, size = 5_000): GithubTreeEntry => ({ path, size, type: "blob" })

describe("processRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("正常系", () => {
    it("採用候補 >= 30 で disabled=false / storedCount=保存件数 で INSERT する", async () => {
      const github = buildGithub({
        getRawContent: vi.fn(async () => buildSourceWithFunctions(40)),
        getRepoMeta: vi.fn(async () => baseMeta),
        listSourceFiles: vi.fn(async () => [fileEntry("src/a.ts")]),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo()

      const result = await processRepo(
        { languageId: 1, name: "r", owner: "o" },
        { crawledRepoRepository, problemRepository },
        { github }
      )

      expect(result).toEqual({
        adopted: true,
        candidatesCount: 40,
        problemsAdded: 40,
        storedCount: 40,
      })
      expect(crawledRepoRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ disabled: false, disabledReason: null, storedCount: 40 })
      )
      expect(problemRepository.bulkCreateSkippingDuplicates).toHaveBeenCalledTimes(1)
    })

    it("採用候補 > 100 のときランダムサンプリングで 100 件に絞る", async () => {
      const github = buildGithub({
        getRawContent: vi.fn(async () => buildSourceWithFunctions(150)),
        getRepoMeta: vi.fn(async () => baseMeta),
        listSourceFiles: vi.fn(async () => [fileEntry("src/a.ts")]),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo()

      const result = await processRepo(
        { languageId: 1, name: "r", owner: "o" },
        { crawledRepoRepository, problemRepository },
        { github }
      )

      expect(result).toMatchObject({ adopted: true, candidatesCount: 150, storedCount: 100 })
      const insertArg = vi.mocked(problemRepository.bulkCreateSkippingDuplicates).mock.calls[0][0]
      expect(insertArg).toHaveLength(100)
    })

    it("repo 内の同 astHash は 1 件だけ採用される（in-repo dedupe）", async () => {
      /** 同一関数を 5 回繰り返す → astHash は同じになる */
      const sameBody = buildSourceWithFunctions(1).repeat(5)
      const github = buildGithub({
        getRawContent: vi.fn(async () => sameBody),
        getRepoMeta: vi.fn(async () => baseMeta),
        listSourceFiles: vi.fn(async () => [fileEntry("src/dup.ts")]),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo()

      const result = await processRepo(
        { languageId: 1, name: "r", owner: "o" },
        { crawledRepoRepository, problemRepository },
        { github }
      )

      /** dedupe 後 < 30 になるので too_few_problems で disabled になる */
      expect(result).toMatchObject({ adopted: false, candidatesCount: 1, reason: "too_few_problems" })
    })

    it("cross-repo dedupe で INSERT 件数 < サンプル件数のときも problemsAdded は実 INSERT 件数を返す", async () => {
      const github = buildGithub({
        getRawContent: vi.fn(async () => buildSourceWithFunctions(40)),
        getRepoMeta: vi.fn(async () => baseMeta),
        listSourceFiles: vi.fn(async () => [fileEntry("src/a.ts")]),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo({
        /** 40 件渡したが 35 件しか INSERT されなかった（5 件は他 repo に同 hash 既存） */
        bulkCreateSkippingDuplicates: vi.fn(async () => 35),
      })

      const result = await processRepo(
        { languageId: 1, name: "r", owner: "o" },
        { crawledRepoRepository, problemRepository },
        { github }
      )

      expect(result).toMatchObject({ adopted: true, problemsAdded: 35, storedCount: 40 })
    })
  })

  describe("異常系", () => {
    it("ライセンスが寛容ライセンスでない場合 disabled=true / reason='license_not_allowed'", async () => {
      const github = buildGithub({
        getRepoMeta: vi.fn(async () => ({ ...baseMeta, license: "GPL-3.0" })),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo()

      const result = await processRepo(
        { languageId: 1, name: "r", owner: "o" },
        { crawledRepoRepository, problemRepository },
        { github }
      )

      expect(result).toEqual({
        adopted: false,
        candidatesCount: 0,
        reason: "license_not_allowed",
      })
      expect(crawledRepoRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ disabled: true, disabledReason: "license_not_allowed" })
      )
      expect(problemRepository.bulkCreateSkippingDuplicates).not.toHaveBeenCalled()
    })

    it("ライセンスが null（GitHub が判別不能）の場合も license_not_allowed", async () => {
      const github = buildGithub({
        getRepoMeta: vi.fn(async () => ({ ...baseMeta, license: null })),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo()

      const result = await processRepo(
        { languageId: 1, name: "r", owner: "o" },
        { crawledRepoRepository, problemRepository },
        { github }
      )

      expect(result).toMatchObject({ adopted: false, reason: "license_not_allowed" })
    })

    it("採用候補が 30 未満なら disabled=true / reason='too_few_problems'", async () => {
      const github = buildGithub({
        getRawContent: vi.fn(async () => buildSourceWithFunctions(10)),
        getRepoMeta: vi.fn(async () => baseMeta),
        listSourceFiles: vi.fn(async () => [fileEntry("src/a.ts")]),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo()

      const result = await processRepo(
        { languageId: 1, name: "r", owner: "o" },
        { crawledRepoRepository, problemRepository },
        { github }
      )

      expect(result).toEqual({
        adopted: false,
        candidatesCount: 10,
        reason: "too_few_problems",
      })
      expect(crawledRepoRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ disabled: true, disabledReason: "too_few_problems" })
      )
    })

    it("4xx エラー（404）は retry せずそのまま throw", async () => {
      const github = buildGithub({
        getRepoMeta: vi.fn(async () => {
          throw new GithubApiError(404, "Not Found")
        }),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo()

      await expect(
        processRepo(
          { languageId: 1, name: "r", owner: "o" },
          { crawledRepoRepository, problemRepository },
          { github }
        )
      ).rejects.toMatchObject({ statusCode: 404 })
    })

    it("個別ファイルの parse 失敗は他のファイルを止めない", async () => {
      const github = buildGithub({
        getRawContent: vi.fn(async (_o, _r, _sha, path) => {
          if (path === "src/bad.ts") throw new GithubApiError(500, "boom")
          return buildSourceWithFunctions(35)
        }),
        getRepoMeta: vi.fn(async () => baseMeta),
        listSourceFiles: vi.fn(async () => [fileEntry("src/good.ts"), fileEntry("src/bad.ts")]),
      })
      const crawledRepoRepository = buildCrawledRepoRepo()
      const problemRepository = buildProblemRepo()

      const result = await processRepo(
        { languageId: 1, name: "r", owner: "o" },
        { crawledRepoRepository, problemRepository },
        { github }
      )

      expect(result).toMatchObject({ adopted: true, candidatesCount: 35 })
    })
  })
})
