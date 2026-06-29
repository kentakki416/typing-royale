import { languageDisplayName, languageShortLabel } from "@repo/generate-image"

/**
 * 言語ラベルは言語マスタ駆動で汎用化されており、未知の slug でも
 * コード変更なしで「先頭大文字」のフォールバックラベルが返る。
 * js / ts のみ短縮形の override を持つ。
 */
describe("languageShortLabel", () => {
  describe("正常系", () => {
    it("javascript は JS を返す", () => {
      expect(languageShortLabel("javascript")).toBe("JS")
    })

    it("typescript は TS を返す", () => {
      expect(languageShortLabel("typescript")).toBe("TS")
    })

    it("override の無い go は先頭大文字の Go を返す", () => {
      expect(languageShortLabel("go")).toBe("Go")
    })

    it("将来追加される未知の言語 (rust) も先頭大文字で自動対応する", () => {
      expect(languageShortLabel("rust")).toBe("Rust")
    })
  })
})

describe("languageDisplayName", () => {
  describe("正常系", () => {
    it("javascript は JavaScript を返す", () => {
      expect(languageDisplayName("javascript")).toBe("JavaScript")
    })

    it("typescript は TypeScript を返す", () => {
      expect(languageDisplayName("typescript")).toBe("TypeScript")
    })

    it("override の無い go は先頭大文字の Go を返す", () => {
      expect(languageDisplayName("go")).toBe("Go")
    })

    it("将来追加される未知の言語 (kotlin) も先頭大文字で自動対応する", () => {
      expect(languageDisplayName("kotlin")).toBe("Kotlin")
    })
  })
})
