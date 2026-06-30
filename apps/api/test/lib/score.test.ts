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
    it("codeBlock 全文を isCorrect=true で踏みきると completed=true", () => {
      const codeBlocks = new Map([[0, "abc"]])
      const log = [
        { elapsedMs: 100, inputChar: "a", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "b", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 300, inputChar: "c", isCorrect: true, problemIndex: 0 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      expect(result.get(0)).toEqual({ charsTyped: 3, completed: true })
    })

    it("途中までしか踏まなかった問題は completed=false", () => {
      const codeBlocks = new Map([[0, "abcdef"]])
      const log = [
        { elapsedMs: 100, inputChar: "a", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "b", isCorrect: true, problemIndex: 0 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      expect(result.get(0)).toEqual({ charsTyped: 2, completed: false })
    })

    it("isCorrect=false のエントリは charsTyped に含めない", () => {
      const codeBlocks = new Map([[0, "abc"]])
      const log = [
        { elapsedMs: 100, inputChar: "a", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 150, inputChar: "x", isCorrect: false, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "b", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 300, inputChar: "c", isCorrect: true, problemIndex: 0 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      expect(result.get(0)).toEqual({ charsTyped: 3, completed: true })
    })

    it("複数問題でも orderIndex 別に集計される", () => {
      const codeBlocks = new Map([[0, "ab"], [1, "xy"]])
      const log = [
        { elapsedMs: 100, inputChar: "a", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "b", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 300, inputChar: "x", isCorrect: true, problemIndex: 1 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      expect(result.get(0)).toEqual({ charsTyped: 2, completed: true })
      expect(result.get(1)).toEqual({ charsTyped: 1, completed: false })
    })

    it("クライアントが嘘の isCorrect を送ってもサーバーが inputChar で判定する", () => {
      const codeBlocks = new Map([[0, "abc"]])
      const log = [
        /** isCorrect=true で送ってきても、inputChar が一致しなければカウントしない */
        { elapsedMs: 100, inputChar: "x", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "a", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 300, inputChar: "b", isCorrect: true, problemIndex: 0 },
      ]
      const result = aggregateProblemProgress(log, codeBlocks)
      /** "x" は不正解扱いで進まず、"a" と "b" のみカウント */
      expect(result.get(0)).toEqual({ charsTyped: 2, completed: false })
    })
  })
})

describe("aggregateMistypeStats", () => {
  describe("正常系", () => {
    it("isCorrect=false 時に「期待文字 → 実際に打った文字」で加算する", () => {
      const codeBlocks = new Map([[0, "hello"]])
      const log = [
        { elapsedMs: 100, inputChar: "h", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "e", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 300, inputChar: "l", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 400, inputChar: "k", isCorrect: false, problemIndex: 0 },
        { elapsedMs: 500, inputChar: "l", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 600, inputChar: "o", isCorrect: true, problemIndex: 0 },
      ]
      const result = aggregateMistypeStats(log, codeBlocks)
      expect(result).toEqual({ l: { k: 1 } })
    })

    it("複数の誤打鍵が累積される", () => {
      const codeBlocks = new Map([[0, "abc"]])
      const log = [
        { elapsedMs: 100, inputChar: "x", isCorrect: false, problemIndex: 0 },
        { elapsedMs: 150, inputChar: "y", isCorrect: false, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "a", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 250, inputChar: "z", isCorrect: false, problemIndex: 0 },
        { elapsedMs: 300, inputChar: "b", isCorrect: true, problemIndex: 0 },
      ]
      const result = aggregateMistypeStats(log, codeBlocks)
      expect(result).toEqual({ a: { x: 1, y: 1 }, b: { z: 1 } })
    })

    it("複数問題でも cursor が problemIndex ごとに独立管理される", () => {
      const codeBlocks = new Map([[0, "ab"], [1, "xy"]])
      const log = [
        { elapsedMs: 100, inputChar: "a", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "z", isCorrect: false, problemIndex: 1 },
        { elapsedMs: 300, inputChar: "b", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 400, inputChar: "x", isCorrect: true, problemIndex: 1 },
        { elapsedMs: 500, inputChar: "z", isCorrect: false, problemIndex: 1 },
      ]
      const result = aggregateMistypeStats(log, codeBlocks)
      expect(result).toEqual({ x: { z: 1 }, y: { z: 1 } })
    })

    it("ログが空なら空オブジェクトを返す", () => {
      const result = aggregateMistypeStats([], new Map([[0, "abc"]]))
      expect(result).toEqual({})
    })

    it("クライアントが嘘の isCorrect を送ってもサーバーが inputChar で判定する", () => {
      const codeBlocks = new Map([[0, "abc"]])
      const log = [
        /** クライアントが isCorrect=true と送ってきても、inputChar="x" は不正解扱い */
        { elapsedMs: 100, inputChar: "x", isCorrect: true, problemIndex: 0 },
        { elapsedMs: 200, inputChar: "a", isCorrect: true, problemIndex: 0 },
        /** isCorrect=false と送ってきても、inputChar="b" は正解扱い → cursor 進む */
        { elapsedMs: 300, inputChar: "b", isCorrect: false, problemIndex: 0 },
      ]
      const result = aggregateMistypeStats(log, codeBlocks)
      /** "a" の位置で "x" を誤入力したと判定される */
      expect(result).toEqual({ a: { x: 1 } })
    })
  })
})
