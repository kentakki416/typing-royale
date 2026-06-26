import { LanguageListItem, LanguageRepository } from "../../../src/repository/prisma"
import { listLanguages } from "../../../src/service/language-service"

const makeLanguageRepository = (
  findAll: () => Promise<LanguageListItem[]>,
): LanguageRepository => ({
  existsById: vi.fn(),
  findAll: vi.fn(findAll),
  findById: vi.fn(),
  findBySlug: vi.fn(),
})

describe("listLanguages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("findAll の結果をそのまま ok で返す", async () => {
      const languages: LanguageListItem[] = [
        { id: 1, name: "TypeScript", slug: "typescript" },
        { id: 2, name: "JavaScript", slug: "javascript" },
      ]
      const languageRepository = makeLanguageRepository(async () => languages)

      const result = await listLanguages({ languageRepository })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual(languages)
      }
    })

    it("0 件のとき空配列を ok で返す", async () => {
      const languageRepository = makeLanguageRepository(async () => [])

      const result = await listLanguages({ languageRepository })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual([])
      }
    })
  })

  describe("異常系", () => {
    it("repository が throw した場合はそのまま伝播する", async () => {
      const languageRepository = makeLanguageRepository(async () => {
        throw new Error("db down")
      })

      await expect(listLanguages({ languageRepository })).rejects.toThrow()
    })
  })
})
