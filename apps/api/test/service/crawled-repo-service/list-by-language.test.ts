import {
  CrawledRepoListItem,
  CrawledRepoRepository,
  LanguageRepository,
} from "../../../src/repository/prisma"
import { listByLanguage } from "../../../src/service/crawled-repo-service"

const makeLanguageRepository = (slugExists: boolean): LanguageRepository => ({
  existsById: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn(),
  findBySlug: vi.fn(async () => (slugExists ? { id: 1, slug: "typescript" } : null)),
})

describe("listByLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("offset/limit を repo に渡し、entries と total（総数）を返す", async () => {
      const entries: CrawledRepoListItem[] = [
        {
          description: null,
          fullName: "a/b",
          homepage: null,
          name: "b",
          owner: "a",
          stars: 10,
          storedCount: 5,
          topics: [],
        },
      ]
      const crawledRepoRepository: CrawledRepoRepository = {
        countActiveByLanguageId: vi.fn(async () => 23),
        findActiveByLanguageId: vi.fn(async () => entries),
        pickRandomEligibleByLanguageId: vi.fn(),
      }

      const result = await listByLanguage(
        { languageSlug: "typescript", limit: 10, offset: 20 },
        { crawledRepoRepository, languageRepository: makeLanguageRepository(true) },
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.entries).toEqual(entries)
        expect(result.value.total).toBe(23)
      }
      // ページング引数（languageId, limit, offset）がそのまま repo に渡る
      expect(crawledRepoRepository.findActiveByLanguageId).toHaveBeenCalledWith(1, 10, 20)
    })
  })

  describe("異常系", () => {
    it("languageSlug が存在しない場合 NOT_FOUND を返す", async () => {
      const crawledRepoRepository: CrawledRepoRepository = {
        countActiveByLanguageId: vi.fn(),
        findActiveByLanguageId: vi.fn(),
        pickRandomEligibleByLanguageId: vi.fn(),
      }

      const result = await listByLanguage(
        { languageSlug: "ruby", limit: 10, offset: 0 },
        { crawledRepoRepository, languageRepository: makeLanguageRepository(false) },
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
    })
  })
})
