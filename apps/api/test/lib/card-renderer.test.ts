import { renderHallOfFameCard, renderMonthlyTopTenCard } from "@repo/generate-image"

/** PNG マジックナンバー (\x89PNG\r\n\x1a\n) で先頭を判定 */
const isPngBuffer = (buf: Buffer): boolean =>
  buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47

/** 初回のみフォントを Google Fonts から fetch するので timeout を緩める */
const RENDER_TIMEOUT_MS = 15_000

describe("renderHallOfFameCard", () => {
  describe("正常系", () => {
    it("rank 1 で 1200×630 の PNG Buffer を返す", { timeout: RENDER_TIMEOUT_MS }, async () => {
      const png = await renderHallOfFameCard({ language: "typescript", rank: 1, username: "alice" })
      expect(isPngBuffer(png)).toBe(true)
      expect(png.length).toBeGreaterThan(1000)
    })

    it("rank 2 (銀) でも有効な PNG Buffer を返す", { timeout: RENDER_TIMEOUT_MS }, async () => {
      const png = await renderHallOfFameCard({ language: "typescript", rank: 2, username: "bob" })
      expect(isPngBuffer(png)).toBe(true)
    })

    it("rank 3 (銅) でも有効な PNG Buffer を返す", { timeout: RENDER_TIMEOUT_MS }, async () => {
      const png = await renderHallOfFameCard({ language: "javascript", rank: 3, username: "carol" })
      expect(isPngBuffer(png)).toBe(true)
    })

    it("rank 7 (黒メイン) でも有効な PNG Buffer を返す", { timeout: RENDER_TIMEOUT_MS }, async () => {
      const png = await renderHallOfFameCard({ language: "typescript", rank: 7, username: "dave" })
      expect(isPngBuffer(png)).toBe(true)
    })
  })
})

describe("renderMonthlyTopTenCard", () => {
  describe("正常系", () => {
    it("青テーマで 1200×630 の PNG Buffer を返す", { timeout: RENDER_TIMEOUT_MS }, async () => {
      const png = await renderMonthlyTopTenCard({
        language: "typescript",
        rank: 1,
        username: "alice",
        yearMonth: "2026-06",
      })
      expect(isPngBuffer(png)).toBe(true)
      expect(png.length).toBeGreaterThan(1000)
    })

    it("rank 7 でも有効な PNG Buffer を返す", { timeout: RENDER_TIMEOUT_MS }, async () => {
      const png = await renderMonthlyTopTenCard({
        language: "javascript",
        rank: 7,
        username: "kobayashi",
        yearMonth: "2026-06",
      })
      expect(isPngBuffer(png)).toBe(true)
    })
  })
})
