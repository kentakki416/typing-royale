import { describe, expect, it } from "vitest"

import { astHashOf } from "../../src/ast/normalize-for-hash"

describe("astHashOf", () => {
  describe("正常系", () => {
    it("連続する空白の違いを吸収して同じハッシュを返す", () => {
      expect(astHashOf("a b")).toBe(astHashOf("a   b"))
    })

    it("改行の有無の違いを吸収して同じハッシュを返す", () => {
      expect(astHashOf("a b")).toBe(astHashOf("a\n\nb"))
    })

    it("タブ / 半角スペース / 改行の混在を吸収する", () => {
      expect(astHashOf("a b")).toBe(astHashOf("a\t\n  b"))
    })

    it("前後の空白の有無を吸収する", () => {
      expect(astHashOf("a b")).toBe(astHashOf("   a b   "))
    })

    it("インデントの違う同一関数を同じハッシュとみなす", () => {
      const a = "function foo() { return 1 }"
      const b = "function foo()  {\n  return 1\n}"
      expect(astHashOf(a)).toBe(astHashOf(b))
    })

    it("識別子（関数名）が違えば別ハッシュ（リネームは多様性として保持）", () => {
      expect(astHashOf("function foo() { return 1 }"))
        .not.toBe(astHashOf("function bar() { return 1 }"))
    })

    it("本体ロジックが違えば別ハッシュ", () => {
      expect(astHashOf("function f() { return 1 }"))
        .not.toBe(astHashOf("function f() { return 2 }"))
    })

    it("SHA-256 として 64 文字の hex を返す", () => {
      expect(astHashOf("function f() { return 1 }")).toMatch(/^[0-9a-f]{64}$/)
    })

    it("同じ入力で複数回呼んでも同じハッシュ（決定的）", () => {
      const input = "function foo() { return 1 }"
      expect(astHashOf(input)).toBe(astHashOf(input))
    })
  })
})
