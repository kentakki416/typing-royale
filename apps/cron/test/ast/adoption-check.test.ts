import { describe, expect, it } from "vitest"

import { checkAdoption } from "../../src/ast/adoption-check"

/** 指定文字数 / 行数を満たすダミーコードを生成 */
const buildCode = (lines: number, lineLength: number): string =>
  Array.from({ length: lines }, () => "x".repeat(lineLength)).join("\n")

describe("checkAdoption", () => {
  describe("正常系", () => {
    it("100 文字 / 5 行（境界値） / 全 ASCII / 関数名あり → adopted", () => {
      const code = buildCode(5, 19) // 5 行 * 19 + 4 改行 = 99 → 微調整
      const result = checkAdoption("ok", `${code }x`) // 5 文字 * 19 + 4 改行 + 1 = 100
      expect(result).toEqual({ adopted: true, charCount: 100, lineCount: 5 })
    })

    it("400 文字 / 25 行（境界値） → adopted", () => {
      const code = buildCode(25, 15) // 25 行 * 15 + 24 改行 = 399
      const result = checkAdoption("fn", `${code }x`) // 400 ジャスト
      expect(result.adopted).toBe(true)
      if (result.adopted) {
        expect(result.charCount).toBe(400)
        expect(result.lineCount).toBe(25)
      }
    })

    it("1 行 120 文字（境界値） → adopted", () => {
      const lines = ["x".repeat(120), "abc", "abc", "abc", "abc"]
      expect(lines[0]).toHaveLength(120)
      const result = checkAdoption("fn", lines.join("\n"))
      expect(result.adopted).toBe(true)
    })
  })

  describe("異常系", () => {
    it("関数名が空文字 → excluded_function_name", () => {
      expect(checkAdoption("", "x".repeat(120))).toEqual({
        adopted: false,
        reason: "excluded_function_name",
      })
    })

    it("テストフレームワーク予約名（test / it / describe など） → excluded_function_name", () => {
      for (const name of ["test", "it", "describe", "beforeEach", "afterEach", "setup"]) {
        const result = checkAdoption(name, "x".repeat(120))
        expect(result).toEqual({ adopted: false, reason: "excluded_function_name" })
      }
    })

    it("コメント除去後が空 → empty_after_strip", () => {
      expect(checkAdoption("fn", "   \n\n  ")).toEqual({
        adopted: false,
        reason: "empty_after_strip",
      })
    })

    it("99 文字（境界値下限を 1 下回る） → char_count_out_of_range", () => {
      const code = buildCode(5, 19) // 5 行 * 19 + 4 改行 = 99
      const result = checkAdoption("fn", code)
      expect(result).toEqual({ adopted: false, reason: "char_count_out_of_range" })
    })

    it("401 文字（境界値上限を 1 超える） → char_count_out_of_range", () => {
      const code = `${buildCode(25, 15) }xx` // 399 + 2 = 401
      const result = checkAdoption("fn", code)
      expect(result).toEqual({ adopted: false, reason: "char_count_out_of_range" })
    })

    it("4 行（境界値下限を 1 下回る） → line_count_out_of_range", () => {
      const code = buildCode(4, 30) // 文字数は範囲内
      const result = checkAdoption("fn", code)
      expect(result).toEqual({ adopted: false, reason: "line_count_out_of_range" })
    })

    it("26 行（境界値上限を 1 超える） → line_count_out_of_range", () => {
      const code = buildCode(26, 5)
      const result = checkAdoption("fn", code)
      expect(result).toEqual({ adopted: false, reason: "line_count_out_of_range" })
    })

    it("1 行 121 文字（境界値上限を 1 超える） → line_too_long", () => {
      const lines = ["x".repeat(121), "abc", "abc", "abc", "abc", "abc"]
      const result = checkAdoption("fn", lines.join("\n"))
      expect(result).toEqual({ adopted: false, reason: "line_too_long" })
    })

    it("日本語コメント / 識別子（非 ASCII） → non_ascii", () => {
      const lines = ["const 値 = 1", "abc", "abc", "abc", "abc", "abc"]
      const code = lines.join("\n")
      /** 文字数を範囲内に調整しつつ非 ASCII を入れる */
      const padded = code + "x".repeat(100 - code.length)
      const result = checkAdoption("fn", padded)
      expect(result).toEqual({ adopted: false, reason: "non_ascii" })
    })
  })
})
