# step3: 特別 SVG バッジ生成（HoF / 月間）

既存 `apps/api/src/lib/badge-svg.ts` と同じ string-template パターンで、HoF / 月間専用の SVG バッジ生成関数を追加する。satori / フォントフェッチは使わず、純粋関数で高速生成。

## 対応内容

### `apps/api/src/lib/badge-svg-hof.ts`（新規）

```typescript
export type HofBadgeInput = {
    language: "typescript" | "javascript"
    rank: number
    username: string
}

/**
 * rank に応じた色テーマを返す
 * - 1 位: 金
 * - 2 位: 銀
 * - 3 位: 銅
 * - 4-10 位: 黒メイン
 */
const getHofTheme = (rank: number) => {
  if (rank === 1) {
    return { accentFrom: "#ffd54a", accentTo: "#d2992a", bgFrom: "#1a1208", bgTo: "#0d0a04", emoji: "👑" }
  }
  if (rank === 2) {
    return { accentFrom: "#e5e7eb", accentTo: "#6b7280", bgFrom: "#1a1a1c", bgTo: "#0a0a0b", emoji: "🥈" }
  }
  if (rank === 3) {
    return { accentFrom: "#d97706", accentTo: "#78350f", bgFrom: "#1c130a", bgTo: "#0d0905", emoji: "🥉" }
  }
  return { accentFrom: "#cbd5e1", accentTo: "#475569", bgFrom: "#1f2937", bgTo: "#030712", emoji: "💎" }
}

const langLabel = (lang: "typescript" | "javascript") => lang === "typescript" ? "TS" : "JS"

export const buildHofBadgeSvg = (input: HofBadgeInput): string => {
  const theme = getHofTheme(input.rank)
  const label = `RANK #${input.rank} · ${langLabel(input.language)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="80" viewBox="0 0 360 80">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.bgFrom}"/>
      <stop offset="100%" stop-color="${theme.bgTo}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.accentFrom}"/>
      <stop offset="100%" stop-color="${theme.accentTo}"/>
    </linearGradient>
  </defs>
  <rect width="360" height="80" rx="10" fill="url(#bg)" stroke="url(#accent)" stroke-width="1.5"/>
  <rect x="0" y="0" width="6" height="80" rx="3" fill="url(#accent)"/>
  <text x="22" y="24" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="11" font-weight="700" fill="${theme.accentFrom}" letter-spacing="2">${theme.emoji} HALL OF FAME</text>
  <text x="22" y="52" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="22" font-weight="900" fill="#fff">${label}</text>
  <text x="22" y="71" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="12" font-weight="700" fill="${theme.accentFrom}" opacity="0.85">@${escapeXml(input.username)}</text>
  <text x="338" y="72" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="9" fill="${theme.accentFrom}" opacity="0.55" text-anchor="end">typing-royale</text>
</svg>`
}
```

### `apps/api/src/lib/badge-svg-monthly.ts`（新規）

```typescript
export type MonthlyBadgeInput = {
    language: "typescript" | "javascript"
    rank: number
    username: string
    yearMonth: string  // "2026-06"
}

const MONTHLY_THEME = {
  accentFrom: "#7dd3fc",
  accentTo: "#0c4a6e",
  bgFrom: "#0a1a26",
  bgTo: "#04101a",
}

export const buildMonthlyBadgeSvg = (input: MonthlyBadgeInput): string => {
  const ym = input.yearMonth.replace("-", ".")  // "2026.06"
  const label = `${ym} #${input.rank} · ${input.language === "typescript" ? "TS" : "JS"}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="80" viewBox="0 0 360 80">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${MONTHLY_THEME.bgFrom}"/>
      <stop offset="100%" stop-color="${MONTHLY_THEME.bgTo}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${MONTHLY_THEME.accentFrom}"/>
      <stop offset="100%" stop-color="${MONTHLY_THEME.accentTo}"/>
    </linearGradient>
  </defs>
  <rect width="360" height="80" rx="10" fill="url(#bg)" stroke="url(#accent)" stroke-width="1.5"/>
  <rect x="0" y="0" width="6" height="80" rx="3" fill="url(#accent)"/>
  <text x="22" y="24" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="11" font-weight="700" fill="${MONTHLY_THEME.accentFrom}" letter-spacing="2">🏆 MONTHLY TOP 10</text>
  <text x="22" y="52" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="22" font-weight="900" fill="#fff">${label}</text>
  <text x="22" y="71" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="12" font-weight="700" fill="${MONTHLY_THEME.accentFrom}" opacity="0.85">@${escapeXml(input.username)}</text>
  <text x="338" y="72" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="9" fill="${MONTHLY_THEME.accentFrom}" opacity="0.55" text-anchor="end">typing-royale</text>
</svg>`
}
```

### README 公開エンドポイント

`apps/api/src/controller/badge/hof-svg.ts` / `monthly-svg.ts` を新規。

- パス: `GET /badge/:username/hall-of-fame.svg?language=ts` / `GET /badge/:username/monthly.svg?language=ts`
- レスポンス: `Content-Type: image/svg+xml`, `Cache-Control: public, max-age=300, stale-while-revalidate=600`
- ロジック: `findByGithubUsername(username)` → `findByKey(userId, { type, language })` で reward を取得 → `assetSvgUrl` をそのまま返す
- 圏外落ち（reward 行が存在しない）の場合は 404 でなく **デフォルトの「未取得」プレースホルダ SVG** を返す（README が割れない配慮）

### Router 登録

`apps/api/src/routes/badge-router.ts` に追加:

```typescript
if (controllers.hofSvg) router.get("/:username/hall-of-fame.svg", controllers.hofSvg.execute)
if (controllers.monthlySvg) router.get("/:username/monthly.svg", controllers.monthlySvg.execute)
```

PUBLIC_PATHS は `/badge` で既にカバー済。

## 動作確認

### ユニットテスト（snapshot）

```typescript
describe("buildHofBadgeSvg", () => {
  describe("正常系", () => {
    it("rank=1 で金テーマの SVG を返す", () => {
      expect(buildHofBadgeSvg({ language: "typescript", rank: 1, username: "alice" })).toMatchSnapshot()
    })
    it("rank=2 で銀テーマの SVG を返す", () => { /* ... */ })
    it("rank=3 で銅テーマの SVG を返す", () => { /* ... */ })
    it("rank=7 で黒メインテーマの SVG を返す", () => { /* ... */ })
  })
  describe("異常系", () => {
    it("username に < や & が含まれてもエスケープされる（XSS 対策）", () => { /* ... */ })
  })
})
```

### Controller テスト

```typescript
describe("GET /badge/:username/hall-of-fame.svg", () => {
  describe("正常系", () => {
    it("入賞中ユーザーの SVG を返す（Content-Type: image/svg+xml）", async () => { /* ... */ })
    it("Cache-Control ヘッダが付いている", async () => { /* ... */ })
  })
  describe("異常系", () => {
    it("未入賞ユーザーはプレースホルダ SVG を 200 で返す（404 ではない）", async () => { /* ... */ })
    it("存在しないユーザー名でも 200 でプレースホルダを返す", async () => { /* ... */ })
  })
})
```
