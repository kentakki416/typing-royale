import * as ts from "typescript"
import { describe, expect, it } from "vitest"

import { extractFunctions } from "../../src/ast/extract-functions"

/**
 * JavaScript 対応の前提（javascript-support spec）：
 * `ts.createSourceFile` はファイル名の拡張子から ScriptKind を自動推定するため、
 * `.js` / `.mjs` / `.cjs` を渡せば JavaScript として正しくパースされ、TypeScript と
 * 同じ抽出ロジック（extractFunctions）がそのまま効く。本テストはその統合前提を担保する。
 */
const parseAs = (fileName: string, code: string): ts.SourceFile =>
  ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true)

describe("extractFunctions (JavaScript)", () => {
  it(".js の FunctionDeclaration を抽出する", () => {
    const sf = parseAs("sample.js", "function add(a, b) {\n  return a + b\n}\n")
    const fns = extractFunctions(sf)
    expect(fns.map((f) => f.functionName)).toEqual(["add"])
  })

  it(".mjs の export const アロー関数を抽出する", () => {
    const sf = parseAs("sample.mjs", "export const mul = (a, b) => {\n  return a * b\n}\n")
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(1)
    expect(fns[0].functionName).toBe("mul")
    expect(fns[0].rawText).toBe("export const mul = (a, b) => {\n  return a * b\n}")
  })

  it(".cjs の FunctionDeclaration を抽出する", () => {
    const sf = parseAs("sample.cjs", "function sub(a, b) {\n  return a - b\n}\n")
    const fns = extractFunctions(sf)
    expect(fns.map((f) => f.functionName)).toEqual(["sub"])
  })

  it("型注釈の無い JS のクラスメソッドを抽出する", () => {
    const sf = parseAs(
      "service.js",
      "class Service {\n  start() {\n    return this.run()\n  }\n}\n"
    )
    const fns = extractFunctions(sf)
    expect(fns.map((f) => f.functionName)).toEqual(["start"])
  })

  it("CommonJS の require / module.exports を含む .js でも宣言済み関数を抽出する", () => {
    const code = [
      "const fs = require(\"fs\")",
      "",
      "function readConfig(path) {",
      "  return fs.readFileSync(path, \"utf8\")",
      "}",
      "",
      "module.exports = { readConfig }",
      "",
    ].join("\n")
    const sf = parseAs("config.js", code)
    const fns = extractFunctions(sf)
    expect(fns.map((f) => f.functionName)).toEqual(["readConfig"])
  })
})
