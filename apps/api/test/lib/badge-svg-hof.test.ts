import { buildHofBadgeSvg } from "@repo/generate-image"

describe("buildHofBadgeSvg", () => {
  describe("正常系", () => {
    it("rank 1 で金テーマ (#ffd54a) と 👑 emoji を含む SVG を返す", () => {
      const svg = buildHofBadgeSvg({ language: "typescript", rank: 1, username: "alice" })
      expect(svg).toContain("#ffd54a")
      expect(svg).toContain("👑")
      expect(svg).toContain("RANK #1 · TS")
      expect(svg).toContain("@alice")
    })

    it("rank 2 で銀テーマ (#e5e7eb) と 🥈 emoji を含む SVG を返す", () => {
      const svg = buildHofBadgeSvg({ language: "typescript", rank: 2, username: "bob" })
      expect(svg).toContain("#e5e7eb")
      expect(svg).toContain("🥈")
      expect(svg).toContain("RANK #2 · TS")
    })

    it("rank 3 で銅テーマ (#d97706) と 🥉 emoji を含む SVG を返す", () => {
      const svg = buildHofBadgeSvg({ language: "javascript", rank: 3, username: "carol" })
      expect(svg).toContain("#d97706")
      expect(svg).toContain("🥉")
      expect(svg).toContain("RANK #3 · JS")
    })

    it("rank 4 で黒メインテーマ (#1f2937) と 💎 emoji を含む SVG を返す", () => {
      const svg = buildHofBadgeSvg({ language: "typescript", rank: 4, username: "dave" })
      expect(svg).toContain("#1f2937")
      expect(svg).toContain("💎")
      expect(svg).toContain("RANK #4 · TS")
    })

    it("rank 10 でも rank 4-10 と同じ黒メインテーマを返す", () => {
      const svg = buildHofBadgeSvg({ language: "typescript", rank: 10, username: "eve" })
      expect(svg).toContain("#1f2937")
      expect(svg).toContain("RANK #10 · TS")
    })

    it("SMIL アニメ (shimmer sweep + pulsing border) が含まれる", () => {
      const svg = buildHofBadgeSvg({ language: "typescript", rank: 1, username: "alice" })
      expect(svg).toContain("<animate")
      expect(svg).toContain("attributeName=\"x\"")
      expect(svg).toContain("attributeName=\"stroke-opacity\"")
    })

    it("language が javascript のとき JS ラベルを使う", () => {
      const svg = buildHofBadgeSvg({ language: "javascript", rank: 1, username: "alice" })
      expect(svg).toContain("RANK #1 · JS")
    })

    it("override の無い language (go) は先頭大文字の Go ラベルを使う", () => {
      const svg = buildHofBadgeSvg({ language: "go", rank: 1, username: "alice" })
      expect(svg).toContain("RANK #1 · Go")
    })
  })

  describe("異常系", () => {
    it("username に XML 特殊文字が含まれてもエスケープされる", () => {
      const svg = buildHofBadgeSvg({ language: "typescript", rank: 1, username: "<script>" })
      expect(svg).not.toContain("<script>")
      expect(svg).toContain("&lt;script&gt;")
    })

    it("username に & が含まれてもエスケープされる", () => {
      const svg = buildHofBadgeSvg({ language: "typescript", rank: 1, username: "a&b" })
      expect(svg).toContain("a&amp;b")
    })
  })
})
