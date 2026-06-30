import { mergeMistypeStats, normalizeMistypeStats, totalMistypeCount } from "../../src/lib/mistype-stats"

describe("normalizeMistypeStats", () => {
  describe("正常系", () => {
    it("flat（number 値）を内訳不明の nested に変換する", () => {
      expect(normalizeMistypeStats({ l: 3 })).toEqual({ l: { "?": 3 } })
    })

    it("nested はそのまま採用する", () => {
      expect(normalizeMistypeStats({ l: { k: 2, o: 1 } })).toEqual({ l: { k: 2, o: 1 } })
    })

    it("flat と nested の混在を正規化できる", () => {
      expect(normalizeMistypeStats({ l: 3, ";": { "'": 5 } })).toEqual({
        ";": { "'": 5 },
        l: { "?": 3 },
      })
    })

    it("内訳 value の非数値は無視する", () => {
      expect(normalizeMistypeStats({ l: { k: 2, x: "nope" } })).toEqual({ l: { k: 2 } })
    })
  })

  describe("異常系", () => {
    it("null / 非オブジェクトは空を返す", () => {
      expect(normalizeMistypeStats(null)).toEqual({})
      expect(normalizeMistypeStats("x")).toEqual({})
      expect(normalizeMistypeStats(undefined)).toEqual({})
    })
  })
})

describe("totalMistypeCount", () => {
  describe("正常系", () => {
    it("内訳の総和を返す", () => {
      expect(totalMistypeCount({ k: 2, o: 1 })).toBe(3)
    })

    it("空の内訳は 0 を返す", () => {
      expect(totalMistypeCount({})).toBe(0)
    })
  })
})

describe("mergeMistypeStats", () => {
  describe("正常系", () => {
    it("期待文字 × 誤入力文字の二段で加算する", () => {
      expect(mergeMistypeStats({ l: { k: 2 } }, { a: { s: 1 }, l: { k: 1, o: 1 } })).toEqual({
        a: { s: 1 },
        l: { k: 3, o: 1 },
      })
    })

    it("base を破壊しない", () => {
      const base = { l: { k: 2 } }
      mergeMistypeStats(base, { l: { k: 1 } })
      expect(base).toEqual({ l: { k: 2 } })
    })
  })
})
