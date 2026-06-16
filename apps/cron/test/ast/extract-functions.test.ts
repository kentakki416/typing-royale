import * as ts from "typescript"
import { describe, expect, it } from "vitest"

import { extractFunctions } from "../../src/ast/extract-functions"

const parse = (code: string): ts.SourceFile =>
  ts.createSourceFile("__inline.ts", code, ts.ScriptTarget.Latest, true)

describe("extractFunctions", () => {
  describe("正常系", () => {
    it("FunctionDeclaration を抽出する", () => {
      const sf = parse("function foo() {\n  return 1\n}\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(1)
      expect(fns[0].functionName).toBe("foo")
      expect(fns[0].sourceLineStart).toBe(1)
      expect(fns[0].sourceLineEnd).toBe(3)
      expect(fns[0].rawText).toContain("function foo()")
    })

    it("const + ArrowFunction を抽出し、rawText に宣言全体を含める", () => {
      const sf = parse("const bar = (x: number) => {\n  return x * 2\n}\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(1)
      expect(fns[0].functionName).toBe("bar")
      expect(fns[0].rawText).toBe("const bar = (x: number) => {\n  return x * 2\n}")
    })

    it("export const + ArrowFunction も rawText に export 修飾子を含める", () => {
      const sf = parse("export const bar = () => {\n  return 1\n}\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(1)
      expect(fns[0].functionName).toBe("bar")
      expect(fns[0].rawText).toBe("export const bar = () => {\n  return 1\n}")
    })

    it("const + FunctionExpression を抽出し、rawText に宣言全体を含める", () => {
      const sf = parse("const baz = function () {\n  return 0\n}\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(1)
      expect(fns[0].functionName).toBe("baz")
      expect(fns[0].rawText).toBe("const baz = function () {\n  return 0\n}")
    })

    it("クラスメソッドを抽出する", () => {
      const sf = parse("class C {\n  greet() {\n    return \"hi\"\n  }\n}\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(1)
      expect(fns[0].functionName).toBe("greet")
    })

    it("複数の関数を順番通りに抽出する", () => {
      const sf = parse("function a() {}\nfunction b() {}\nfunction c() {}\n")
      const fns = extractFunctions(sf)
      expect(fns.map((f) => f.functionName)).toEqual(["a", "b", "c"])
    })

    it("rawText はソース上の原文を保持する（インデント・改行含む）", () => {
      const code = "function withIndent() {\n    const x = 1\n    return x\n}\n"
      const sf = parse(code)
      const fns = extractFunctions(sf)
      expect(fns[0].rawText).toBe("function withIndent() {\n    const x = 1\n    return x\n}")
    })

    it("行範囲は 1-indexed で開始・終了行を返す", () => {
      const sf = parse("\n\nfunction late() {\n  return 1\n}\n")
      const fns = extractFunctions(sf)
      expect(fns[0].sourceLineStart).toBe(3)
      expect(fns[0].sourceLineEnd).toBe(5)
    })
  })

  describe("異常系", () => {
    it("無名 FunctionExpression（const に代入されていない）は抽出しない", () => {
      const sf = parse("(function () { return 1 })()\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(0)
    })

    it("オブジェクトリテラルのプロパティアロー関数は抽出しない", () => {
      const sf = parse("const obj = {\n  hello: () => {\n    return 1\n  },\n}\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(0)
    })

    it("複数宣言の const は抽出しない", () => {
      const sf = parse("const a = 1, foo = () => {\n  return 2\n}\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(0)
    })

    it("for ループ初期化子の const arrow は抽出しない", () => {
      const sf = parse("for (const handler = () => 1; ;) {\n  break\n}\n")
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(0)
    })

    it("メソッド内のネスト関数（IIFE 等）は親メソッドだけ抽出して子は抽出しない", () => {
      const sf = parse(`
class C {
  outer() {
    const inner = () => {
      return 1
    }
    return inner()
  }
}
`)
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(1)
      expect(fns[0].functionName).toBe("outer")
    })

    it("関数内のネスト関数は二重抽出されない", () => {
      const sf = parse(`
function outer() {
  function inner() {
    return 1
  }
  return inner()
}
`)
      const fns = extractFunctions(sf)
      expect(fns).toHaveLength(1)
      expect(fns[0].functionName).toBe("outer")
    })

    it("空のファイルは空配列を返す", () => {
      const sf = parse("")
      expect(extractFunctions(sf)).toEqual([])
    })

    it("関数を含まないコードは空配列を返す", () => {
      const sf = parse("const x = 1\nconst y = 2\n")
      expect(extractFunctions(sf)).toEqual([])
    })
  })
})
