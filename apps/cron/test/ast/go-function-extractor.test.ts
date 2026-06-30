import { beforeAll, describe, expect, it } from "vitest"

import { createGoExtractor, type GoFunctionExtractor } from "../../src/ast/go-function-extractor"

describe("GoFunctionExtractor", () => {
  let extractor: GoFunctionExtractor

  /** tree-sitter-go の wasm ロードは非同期なので一度だけ初期化する */
  beforeAll(async () => {
    extractor = await createGoExtractor()
  })

  describe("extract", () => {
    it("func 宣言と method 宣言を抽出する", () => {
      const src = [
        "package x",
        "",
        "func Add(a, b int) int { return a + b }",
        "",
        "func (s *Server) Start(ctx context.Context) error { return nil }",
        "",
      ].join("\n")
      const names = extractor.extract(src, "x.go").map((c) => c.functionName)
      expect(names).toContain("Add")
      expect(names).toContain("Start")
    })

    it("コメントを本文から除去する", () => {
      const src = [
        "package x",
        "",
        "// Add は加算する",
        "func Add(a, b int) int {",
        "\t// inline コメント",
        "\treturn a + b // 行末コメント",
        "}",
        "",
      ].join("\n")
      const cand = extractor.extract(src, "x.go").find((c) => c.functionName === "Add")
      expect(cand).toBeDefined()
      expect(cand!.codeStripped).not.toContain("inline")
      expect(cand!.codeStripped).not.toContain("行末")
      expect(cand!.codeStripped).toContain("return a + b")
      /** コメント跡地の空白だけの行も詰める */
      expect(cand!.codeStripped.split("\n").some((line) => line.trim() === "")).toBe(false)
    })

    it("1-indexed の行範囲を返す", () => {
      const src = ["package x", "", "func Foo() {", "\treturn", "}", ""].join("\n")
      const cand = extractor.extract(src, "x.go")[0]
      expect(cand.sourceLineStart).toBe(3)
      expect(cand.sourceLineEnd).toBe(5)
    })

    it("文字列リテラル内の // はコメント扱いしない（保護される）", () => {
      const src = [
        "package x",
        "func Foo() string {",
        "\treturn \"https://example.com\"",
        "}",
        "",
      ].join("\n")
      const cand = extractor.extract(src, "x.go")[0]
      expect(cand.codeStripped).toContain("https://example.com")
    })
  })

  describe("isExcludedName", () => {
    it("Test / Benchmark / Example / Fuzz プレフィックスを除外する", () => {
      for (const name of ["TestAdd", "BenchmarkParse", "ExampleFoo", "FuzzBar"]) {
        expect(extractor.isExcludedName(name)).toBe(true)
      }
    })

    it("通常の関数名は除外しない", () => {
      for (const name of ["Add", "Start", "parseConfig", "handleRequest"]) {
        expect(extractor.isExcludedName(name)).toBe(false)
      }
    })
  })
})
