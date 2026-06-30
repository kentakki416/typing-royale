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

    it("`${...}` を含むテンプレートリテラルの後ろにあるコメントを除去する", () => {
      const input = [
        "function f() {",
        "  const msg = `id ${id} end`",
        "  // should be removed",
        "  return msg",
        "}",
      ].join("\n")
      const result = removeComments(input)
      expect(result).not.toContain("should be removed")
      expect(result).not.toContain("//")
      expect(result).toContain("`id ${id} end`")
      expect(result).toContain("return msg")
    })

    it("`${...}` テンプレートリテラルを 2 回使う関数で挟まれたコメントを除去する", () => {
      const input = [
        "function deleteFolder(id) {",
        "  if (!folder) {",
        "    throw new Error(`Folder with id ${id} not found`)",
        "  }",
        "  try {",
        "    rm(folderPath)",
        "  } catch (error) {",
        "    // If folder doesn't exist, still throw the original error",
        "    throw new Error(`Folder with id ${id} not found`)",
        "  }",
        "}",
      ].join("\n")
      const result = removeComments(input)
      expect(result).not.toContain("If folder doesn't exist")
      expect(result).not.toContain("//")
      expect(result).toContain("throw new Error(`Folder with id ${id} not found`)")
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

    it("連続する空行をすべて詰める", () => {
      const input = "const a = 1\n\n\n\n\nconst b = 2\n"
      const result = removeComments(input)
      expect(result).toBe("const a = 1\nconst b = 2\n")
    })

    it("元から存在する 1 行の空行も詰める", () => {
      const input = "const a = 1\n\nconst b = 2\n"
      const result = removeComments(input)
      expect(result).toBe("const a = 1\nconst b = 2\n")
    })

    it("コメント跡地のインデントだけの空行も詰める", () => {
      const input = "function f() {\n  const a = 1\n  // second\n  return a\n}\n"
      const result = removeComments(input)
      expect(result).toBe("function f() {\n  const a = 1\n  return a\n}\n")
    })

    it("コメントだけのファイルは空文字列になる", () => {
      const result = removeComments("// only comment\n/* another */\n")
      expect(result).toBe("")
    })
  })

  describe("異常系", () => {
    it("空文字列を渡してもクラッシュしない", () => {
      expect(removeComments("")).toBe("")
    })

    it("コメントも空行も無いコードはそのまま返る", () => {
      const input = "const x = 1\nconst y = 2\n"
      expect(removeComments(input)).toBe(input)
    })
  })
})
