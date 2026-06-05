import { describe, expect, it } from "vitest"

import { removeComments } from "../../src/ast/remove-comments"

describe("removeComments", () => {
  describe("正常系", () => {
    it("単一行コメントを除去する", () => {
      const result = removeComments("const x = 1 // initial\nconst y = 2\n")
      expect(result).not.toContain("//")
      expect(result).not.toContain("initial")
      expect(result).toContain("const x = 1")
      expect(result).toContain("const y = 2")
    })

    it("複数行コメント / JSDoc を除去する", () => {
      const input = "/** docs */\nfunction foo() {\n  /* inline */\n  return 1\n}\n"
      const result = removeComments(input)
      expect(result).not.toContain("docs")
      expect(result).not.toContain("inline")
      expect(result).toContain("function foo()")
      expect(result).toContain("return 1")
    })

    it("文字列リテラル内の `//` は保護される", () => {
      const result = removeComments("const url = \"https://example.com\"\n")
      expect(result).toContain("https://example.com")
    })

    it("テンプレートリテラル内の `//` は保護される", () => {
      const result = removeComments("const url = `https://example.com/${id}`\n")
      expect(result).toContain("https://example.com")
    })

    it("正規表現リテラル内の `//` パターンは保護される", () => {
      const result = removeComments("const re = /\\/\\/ comment/g\n")
      expect(result).toContain("/\\/\\/ comment/g")
    })

    it("コメントが本体の中央にあっても処理できる", () => {
      const input = "function f() {\n  const a = 1 // first\n  // second\n  return a\n}\n"
      const result = removeComments(input)
      expect(result).not.toContain("first")
      expect(result).not.toContain("second")
      expect(result).toContain("const a = 1")
      expect(result).toContain("return a")
    })

    it("連続する空行を 2 行に折り畳む", () => {
      const input = "const a = 1\n\n\n\n\nconst b = 2\n"
      const result = removeComments(input)
      expect(result).toBe("const a = 1\n\nconst b = 2\n")
    })

    it("コメントだけのファイルは（連続空行畳み込み後の）空白文字列だけが残る", () => {
      const result = removeComments("// only comment\n/* another */\n")
      expect(result.trim()).toBe("")
    })
  })

  describe("異常系", () => {
    it("空文字列を渡してもクラッシュしない", () => {
      expect(removeComments("")).toBe("")
    })

    it("コメントを含まないコードはそのまま返る（連続空行畳み込みのみ）", () => {
      const input = "const x = 1\nconst y = 2\n"
      expect(removeComments(input)).toBe(input)
    })
  })
})
