import {
  aggregateMistypeStats,
  aggregateProblemProgress,
  computeScore,
  isWithinPhysicalLimits,
} from "../../src/lib/score"

describe("computeScore", () => {
  describe("正常系", () => {
    it("typedChars * accuracy を floor して整数を返す", () => {
      expect(computeScore(100, 0.5)).toBe(50)
      expect(computeScore(100, 0.999)).toBe(99)
      expect(computeScore(0, 0)).toBe(0)
      expect(computeScore(1500, 1)).toBe(1500)
    })

    it("ユーザーに有利な丸めをしない（floor）", () => {
      expect(computeScore(100, 0.555)).toBe(55)
    })
  })
})

describe("isWithinPhysicalLimits", () => {
  describe("正常系", () => {
    it("0 〜 1500 文字 / 0.0 〜 1.0 の範囲内は true", () => {
      expect(isWithinPhysicalLimits(0, 0)).toBe(true)
      expect(isWithinPhysicalLimits(1500, 1)).toBe(true)
      expect(isWithinPhysicalLimits(750, 0.5)).toBe(true)
    })
  })

  describe("異常系", () => {
    it("typedChars > 1500 は false", () => {
      expect(isWithinPhysicalLimits(1501, 0.5)).toBe(false)
    })

    it("typedChars < 0 は false", () => {
      expect(isWithinPhysicalLimits(-1, 0.5)).toBe(false)
    })

    it("accuracy > 1 は false", () => {
      expect(isWithinPhysicalLimits(100, 1.01)).toBe(false)
    })

    it("accuracy < 0 は false", () => {
      expect(isWithinPhysicalLimits(100, -0.1)).toBe(false)
    })
  })
})

describe("aggregateProblemProgress", () => {
  describe("正常系", () => {
    it("codeBlock 全文を ok=true で踏みきると completed=true", () => {
      const codeBlocks = new Map([[0, "abc"]])
      const log = [
        { ch: "a", ok: true, p: 0, t: 100 },
        { ch: "b", ok: true, p: 0, t: 200 },
        { ch: "c", ok: true, p: 0, t: 300 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      expect(result.get(0)).toEqual({ charsTyped: 3, completed: true })
    })

    it("途中までしか踏まなかった問題は completed=false", () => {
      const codeBlocks = new Map([[0, "abcdef"]])
      const log = [
        { ch: "a", ok: true, p: 0, t: 100 },
        { ch: "b", ok: true, p: 0, t: 200 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      expect(result.get(0)).toEqual({ charsTyped: 2, completed: false })
    })

    it("ok=false のエントリは charsTyped に含めない", () => {
      const codeBlocks = new Map([[0, "abc"]])
      const log = [
        { ch: "a", ok: true, p: 0, t: 100 },
        { ch: "x", ok: false, p: 0, t: 150 },
        { ch: "b", ok: true, p: 0, t: 200 },
        { ch: "c", ok: true, p: 0, t: 300 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      expect(result.get(0)).toEqual({ charsTyped: 3, completed: true })
    })

    it("複数問題でも orderIndex 別に集計される", () => {
      const codeBlocks = new Map([[0, "ab"], [1, "xy"]])
      const log = [
        { ch: "a", ok: true, p: 0, t: 100 },
        { ch: "b", ok: true, p: 0, t: 200 },
        { ch: "x", ok: true, p: 1, t: 300 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      expect(result.get(0)).toEqual({ charsTyped: 2, completed: true })
      expect(result.get(1)).toEqual({ charsTyped: 1, completed: false })
    })
  })
})

describe("aggregateMistypeStats", () => {
  describe("正常系", () => {
    it("ok=false 時に「正解期待文字」をキーに加算する", () => {
      const codeBlocks = new Map([[0, "hello"]])
      const log = [
        { ch: "h", ok: true, p: 0, t: 100 },
        { ch: "e", ok: true, p: 0, t: 200 },
        { ch: "l", ok: true, p: 0, t: 300 },
        { ch: "k", ok: false, p: 0, t: 400 },
        { ch: "l", ok: true, p: 0, t: 500 },
        { ch: "o", ok: true, p: 0, t: 600 },
      ]
      const result = aggregateMistypeStats(log, codeBlocks)
      expect(result).toEqual({ l: 1 })
    })

    it("複数の誤打鍵が累積される", () => {
      const codeBlocks = new Map([[0, "abc"]])
      const log = [
        { ch: "x", ok: false, p: 0, t: 100 },
        { ch: "y", ok: false, p: 0, t: 150 },
        { ch: "a", ok: true, p: 0, t: 200 },
        { ch: "z", ok: false, p: 0, t: 250 },
        { ch: "b", ok: true, p: 0, t: 300 },
      ]
      const result = aggregateMistypeStats(log, codeBlocks)
      expect(result).toEqual({ a: 2, b: 1 })
    })

    it("複数問題でも cursor が p ごとに独立管理される", () => {
      const codeBlocks = new Map([[0, "ab"], [1, "xy"]])
      const log = [
        { ch: "a", ok: true, p: 0, t: 100 },
        { ch: "z", ok: false, p: 1, t: 200 },
        { ch: "b", ok: true, p: 0, t: 300 },
        { ch: "x", ok: true, p: 1, t: 400 },
        { ch: "z", ok: false, p: 1, t: 500 },
      ]
      const result = aggregateMistypeStats(log, codeBlocks)
      expect(result).toEqual({ x: 1, y: 1 })
    })

    it("ログが空なら空オブジェクトを返す", () => {
      const result = aggregateMistypeStats([], new Map([[0, "abc"]]))
      expect(result).toEqual({})
    })
  })
})
