# step4: 特別 PNG 達成カード生成（HoF / 月間）

既存 `apps/api/src/lib/card-renderer.ts` の satori + resvg-js パターンを踏襲して `renderHallOfFameCard` / `renderMonthlyTopTenCard` を追加。サイズ（1200×630）・フォント（Noto Sans JP）・基本レイアウトは既存 `renderGradeUpCard` と統一。

## 対応内容

### `apps/api/src/lib/card-renderer.ts` 拡張

```typescript
export type RenderHallOfFameCardInput = {
    language: "typescript" | "javascript"
    rank: number
    username: string
}

const HOF_GRADIENTS = {
  1: { from: "#ffd54a", to: "#8a5a0a", label: "👑 HALL OF FAME" },
  2: { from: "#e5e7eb", to: "#6b7280", label: "🥈 HALL OF FAME" },
  3: { from: "#d97706", to: "#78350f", label: "🥉 HALL OF FAME" },
  rest: { from: "#1f2937", to: "#030712", label: "💎 HALL OF FAME" },
}

const getHofGradient = (rank: number) =>
  rank === 1 ? HOF_GRADIENTS[1]
  : rank === 2 ? HOF_GRADIENTS[2]
  : rank === 3 ? HOF_GRADIENTS[3]
  : HOF_GRADIENTS.rest

export const renderHallOfFameCard = async (input: RenderHallOfFameCardInput): Promise<Buffer> => {
  const font = await loadFont()
  const g = getHofGradient(input.rank)
  const langLabel = input.language === "typescript" ? "TypeScript" : "JavaScript"
  const rankText = `RANK #${input.rank}`

  const svg = await satori(
    {
      type: "div",
      props: {
        children: [
          { type: "div", props: { children: g.label, style: { color: "#fff", fontSize: 36, fontWeight: 700, letterSpacing: 4, opacity: 0.95 } } },
          { type: "div", props: { children: rankText, style: { color: "#fff", fontSize: 180, fontWeight: 900, lineHeight: 1.1, marginTop: 24, textShadow: "0 6px 32px rgba(0,0,0,0.45)" } } },
          { type: "div", props: { children: `@${input.username}`, style: { color: "#fff", fontSize: 44, fontWeight: 700, marginTop: 24, opacity: 0.97 } } },
          { type: "div", props: { children: langLabel, style: { color: "#fff", fontSize: 22, fontWeight: 700, marginTop: 16, opacity: 0.85, border: "1.5px solid rgba(255,255,255,0.5)", borderRadius: 23, padding: "8px 28px" } } },
          { type: "div", props: { children: "Typing Royale", style: { color: "#fff", fontSize: 22, marginTop: 40, opacity: 0.72 } } },
        ],
        style: {
          alignItems: "center",
          background: `linear-gradient(180deg, ${g.from} 0%, ${g.to} 100%)`,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 64,
          width: "100%",
        },
      },
    } as never,
    { fonts: [{ data: font, name: "NotoSansJP", style: "normal", weight: 700 }], height: 630, width: 1200 },
  )

  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng())
}

/** 月間 TOP 10 カード（青固定） */
export type RenderMonthlyTopTenCardInput = {
    language: "typescript" | "javascript"
    rank: number
    username: string
    yearMonth: string  // "2026-06"
}

const MONTHLY_GRADIENT = { from: "#7dd3fc", to: "#0c4a6e" }

export const renderMonthlyTopTenCard = async (input: RenderMonthlyTopTenCardInput): Promise<Buffer> => {
  const font = await loadFont()
  const ymLabel = input.yearMonth.replace("-", ".")  // "2026.06"
  const langLabel = input.language === "typescript" ? "TypeScript" : "JavaScript"

  const svg = await satori(
    {
      type: "div",
      props: {
        children: [
          { type: "div", props: { children: "🏆 MONTHLY TOP 10", style: { color: "#fff", fontSize: 36, fontWeight: 700, letterSpacing: 4, opacity: 0.95 } } },
          { type: "div", props: { children: ymLabel, style: { color: "#fff", fontSize: 64, fontWeight: 700, letterSpacing: 4, marginTop: 16, opacity: 0.92 } } },
          { type: "div", props: { children: `RANK #${input.rank}`, style: { color: "#fff", fontSize: 160, fontWeight: 900, lineHeight: 1.1, marginTop: 16, textShadow: "0 6px 32px rgba(0,0,0,0.5)" } } },
          { type: "div", props: { children: `@${input.username}`, style: { color: "#fff", fontSize: 40, fontWeight: 700, marginTop: 24, opacity: 0.97 } } },
          { type: "div", props: { children: langLabel, style: { color: "#fff", fontSize: 22, fontWeight: 700, marginTop: 12, opacity: 0.85, border: "1.5px solid rgba(255,255,255,0.5)", borderRadius: 22, padding: "8px 28px" } } },
          { type: "div", props: { children: "Typing Royale", style: { color: "#fff", fontSize: 20, marginTop: 36, opacity: 0.7 } } },
        ],
        style: {
          alignItems: "center",
          background: `linear-gradient(180deg, ${MONTHLY_GRADIENT.from} 0%, ${MONTHLY_GRADIENT.to} 100%)`,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 64,
          width: "100%",
        },
      },
    } as never,
    { fonts: [{ data: font, name: "NotoSansJP", style: "normal", weight: 700 }], height: 630, width: 1200 },
  )

  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng())
}
```

### Service への組み込み

`generateReward`（step2）の内部で `input.type === "hall_of_fame_in"` / `"monthly_top_ten"` に応じて上記関数を呼ぶ。生成した PNG は `cardStorage.save(`rewards/{userId}/{type}-{language}-{yearMonth?}.png`, buffer)` で S3 に保存し、返却された URL を `rewards.assetUrl` に保存する。

## 動作確認

### ユニットテスト（PNG バッファサイズ検証）

```typescript
describe("renderHallOfFameCard", () => {
  describe("正常系", () => {
    it("rank=1 で金テーマの PNG を返す（バッファサイズが 0 でない）", async () => { /* ... */ })
    it("rank=4 で黒メインテーマの PNG を返す", async () => { /* ... */ })
  })
})

describe("renderMonthlyTopTenCard", () => {
  describe("正常系", () => {
    it("2026-06 / rank=1 で青テーマの PNG を返す", async () => { /* ... */ })
  })
})
```

PNG のピクセル一致まで検証するのは過剰なので、バッファサイズ > 0 + 先頭バイトが PNG マジックナンバー (`89 50 4E 47`) であることを assert する程度で十分。

### 目視確認

`pnpm --filter api test:render-cards` のような devtool を一時的に書き、PNG を `/tmp/preview/` に書き出して画像ビューアで確認する（コミットしない）。
