import { buildMonthlyBadgeSvg } from "../../src/lib/badge-svg-monthly"

describe("buildMonthlyBadgeSvg", () => {
  describe("正常系", () => {
    it("青テーマ (#7dd3fc) と 🏆 emoji を含む SVG を返す", () => {
      const svg = buildMonthlyBadgeSvg({
        language: "typescript",
        rank: 1,
        username: "alice",
        yearMonth: "2026-06",
      })
      expect(svg).toContain("#7dd3fc")
      expect(svg).toContain("🏆 MONTHLY TOP 10")
    })

    it("yearMonth を `YYYY.MM` 形式で表示する", () => {
      const svg = buildMonthlyBadgeSvg({
        language: "typescript",
        rank: 1,
        username: "alice",
        yearMonth: "2026-06",
      })
      expect(svg).toContain("2026.06 #1 · TS")
    })

    it("rank 7 でも同じ青テーマで rank 番号だけ変わる", () => {
      const svg = buildMonthlyBadgeSvg({
        language: "typescript",
        rank: 7,
        username: "bob",
        yearMonth: "2026-06",
      })
      expect(svg).toContain("#7dd3fc")
      expect(svg).toContain("2026.06 #7 · TS")
    })

    it("language が javascript のとき JS ラベルを使う", () => {
      const svg = buildMonthlyBadgeSvg({
        language: "javascript",
        rank: 3,
        username: "carol",
        yearMonth: "2026-06",
      })
      expect(svg).toContain("2026.06 #3 · JS")
    })

    it("username を `@username` 形式で表示する", () => {
      const svg = buildMonthlyBadgeSvg({
        language: "typescript",
        rank: 1,
        username: "alice",
        yearMonth: "2026-06",
      })
      expect(svg).toContain("@alice")
    })

    it("SMIL アニメ (shimmer sweep + pulsing border) が含まれる", () => {
      const svg = buildMonthlyBadgeSvg({
        language: "typescript",
        rank: 1,
        username: "alice",
        yearMonth: "2026-06",
      })
      expect(svg).toContain("<animate")
      expect(svg).toContain("attributeName=\"x\"")
      expect(svg).toContain("attributeName=\"stroke-opacity\"")
    })
  })

  describe("異常系", () => {
    it("username に XML 特殊文字が含まれてもエスケープされる", () => {
      const svg = buildMonthlyBadgeSvg({
        language: "typescript",
        rank: 1,
        username: "<script>",
        yearMonth: "2026-06",
      })
      expect(svg).not.toContain("<script>")
      expect(svg).toContain("&lt;script&gt;")
    })
  })
})
