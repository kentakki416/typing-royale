import { describe, expect, it } from "vitest"

import { TsFunctionExtractor } from "../../src/ast/ts-function-extractor"

describe("TsFunctionExtractor", () => {
  const extractor = new TsFunctionExtractor()

  describe("extract", () => {
    it("関数を抽出し、コメントを除去した本文を返す", () => {
      const src = [
        "// leading comment",
        "function foo(a: number): number {",
        "  // inline comment",
        "  return a + 1",
        "}",
        "",
      ].join("\n")
      const cands = extractor.extract(src, "sample.ts")
      expect(cands).toHaveLength(1)
      expect(cands[0].functionName).toBe("foo")
      expect(cands[0].codeStripped).not.toContain("inline comment")
      expect(cands[0].sourceLineStart).toBe(2)
      expect(cands[0].sourceLineEnd).toBe(5)
    })

    it(".js でも JavaScript として抽出できる（拡張子で ScriptKind 自動推定）", () => {
      const cands = extractor.extract("function add(a, b) {\n  return a + b\n}\n", "sample.js")
      expect(cands.map((c) => c.functionName)).toEqual(["add"])
    })
  })

  describe("isExcludedName", () => {
    it("テストフレームワーク予約名を除外する", () => {
      for (const name of ["test", "it", "describe", "beforeEach", "afterEach", "setup", "teardown"]) {
        expect(extractor.isExcludedName(name)).toBe(true)
      }
    })

    it("通常の関数名は除外しない", () => {
      for (const name of ["foo", "handleClick", "parseConfig"]) {
        expect(extractor.isExcludedName(name)).toBe(false)
      }
    })
  })
})
