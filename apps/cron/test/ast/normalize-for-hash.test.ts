import { describe, expect, it } from "vitest"

import { astHashOf, normalize } from "../../src/ast/normalize-for-hash"

describe("normalize", () => {
  describe("正常系", () => {
    it("連続する空白を 1 つに圧縮する", () => {
      expect(normalize("a   b")).toBe("a b")
    })

    it("改行も空白として扱う", () => {
      expect(normalize("a\n\nb")).toBe("a b")
    })

    it("tab / space / 改行が混ざっていても 1 つの空白に集約される", () => {
      expect(normalize("a\t\n  b")).toBe("a b")
    })

    it("前後の空白を trim する", () => {
      expect(normalize("   a b   ")).toBe("a b")
    })
  })
})

describe("astHashOf", () => {
  describe("正常系", () => {
    it("同じ正規化結果になる入力は同じハッシュを返す", () => {
      const a = "function foo() { return 1 }"
      const b = "function foo()  {\n  return 1\n}"
      expect(astHashOf(a)).toBe(astHashOf(b))
    })

    it("識別子が違えば別ハッシュ（リネームは多様性として保持）", () => {
      const a = "function foo() { return 1 }"
      const b = "function bar() { return 1 }"
      expect(astHashOf(a)).not.toBe(astHashOf(b))
    })

    it("本体ロジックが違えば別ハッシュ", () => {
      const a = "function f() { return 1 }"
      const b = "function f() { return 2 }"
      expect(astHashOf(a)).not.toBe(astHashOf(b))
    })

    it("SHA-256 として 64 文字の hex を返す", () => {
      const hash = astHashOf("function f() { return 1 }")
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it("同じ入力で複数回呼んでも同じハッシュ（決定的）", () => {
      const input = "function foo() { return 1 }"
      expect(astHashOf(input)).toBe(astHashOf(input))
    })
  })
})
