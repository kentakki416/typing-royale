import { describe, expect, it } from "vitest"

import { checkAdoption } from "../../src/ast/adoption-check"

/** 指定文字数 / 行数を満たすダミーコードを生成 */
const buildCode = (lines: number, lineLength: number): string =>
  Array.from({ length: lines }, () => "x".repeat(lineLength)).join("\n")

describe("checkAdoption", () => {
  describe("正常系", () => {
    it("200 文字 / 8 行（境界値） / 全 ASCII / 関数名あり → adopted", () => {
      const code = buildCode(8, 24) // 8 行 * 24 + 7 改行 = 199
      const result = checkAdoption("ok", `${code }x`) // 200 ジャスト
      expect(result).toEqual({ adopted: true, charCount: 200, lineCount: 8 })
    })

    it("700 文字 / 40 行（境界値） → adopted", () => {
      const code = buildCode(40, 16) // 40 行 * 16 + 39 改行 = 679
      const result = checkAdoption("fn", `${code }${"x".repeat(21)}`) // 700 ジャスト
      expect(result.adopted).toBe(true)
      if (result.adopted) {
        expect(result.charCount).toBe(700)
        expect(result.lineCount).toBe(40)
      }
    })

    it("1 行 120 文字（境界値） → adopted", () => {
      /** 1 行目を 120 字 + 残り 7 行は 15 字で、合計 232 字（200-700 範囲内） */
      const lines = ["x".repeat(120), ...Array(7).fill("x".repeat(15))]
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

    it("199 文字（境界値下限を 1 下回る） → char_count_out_of_range", () => {
      const code = buildCode(8, 24) // 8 行 * 24 + 7 改行 = 199
      const result = checkAdoption("fn", code)
      expect(result).toEqual({ adopted: false, reason: "char_count_out_of_range" })
    })

    it("701 文字（境界値上限を 1 超える） → char_count_out_of_range", () => {
      const code = `${buildCode(40, 16)}${"x".repeat(22)}` // 679 + 22 = 701
      const result = checkAdoption("fn", code)
      expect(result).toEqual({ adopted: false, reason: "char_count_out_of_range" })
    })

    it("7 行（境界値下限を 1 下回る） → line_count_out_of_range", () => {
      const code = buildCode(7, 30) // 文字数は範囲内 (7 行 * 30 + 6 = 216)
      const result = checkAdoption("fn", code)
      expect(result).toEqual({ adopted: false, reason: "line_count_out_of_range" })
    })

    it("41 行（境界値上限を 1 超える） → line_count_out_of_range", () => {
      const code = buildCode(41, 16) // 41 行 * 16 + 40 = 696
      const result = checkAdoption("fn", code)
      expect(result).toEqual({ adopted: false, reason: "line_count_out_of_range" })
    })

    it("1 行 121 文字（境界値上限を 1 超える） → line_too_long", () => {
      /** char_count check を通すため残り 7 行を 15 字に膨らませる (合計 233 字) */
      const lines = ["x".repeat(121), ...Array(7).fill("x".repeat(15))]
      const result = checkAdoption("fn", lines.join("\n"))
      expect(result).toEqual({ adopted: false, reason: "line_too_long" })
    })

    it("日本語コメント / 識別子（非 ASCII） → non_ascii", () => {
      /** 8 行 / 全行 ≤ 120 字 / 合計 200 字以上 / 1 行目に非 ASCII を含む */
      const lines = ["const 値 = 1", ...Array(7).fill("abc".repeat(9))]
      const result = checkAdoption("fn", lines.join("\n"))
      expect(result).toEqual({ adopted: false, reason: "non_ascii" })
    })
  })
})
