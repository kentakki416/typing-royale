/**
 * 現状の特典画像（バッジ SVG / カード PNG）を docs/assets/rewards/ に書き出す再生成スクリプト。
 *
 * 既存デザインをいつでも確認できるようにするためのもので、`packages/generate-image` の
 * 実 renderer をそのまま呼んで出力する（モックではない）。
 *
 * 使い方（リポジトリのどこからでも可）:
 *   1. pnpm --filter @repo/generate-image build   # dist を生成（依存も先にビルド）
 *   2. node docs/assets/rewards/generate.mjs
 *
 * 注: カード PNG はフォント (Noto Sans JP) を実行時に fetch するためネット接続が必要。
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const OUT = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(OUT, "../../..")
const {
  buildHofBadgeSvg,
  buildMonthlyBadgeSvg,
  renderGradeUpCard,
  renderHallOfFameCard,
  renderMonthlyTopTenCard,
} = await import(resolve(REPO_ROOT, "packages/generate-image/dist/index.js"))

const USER = "kenta"
const LANGS = ["typescript", "javascript", "go"]
const HOF_RANKS = [1, 2, 3, 5]
const GRADES = [
  ["intern", "Intern"],
  ["junior", "Junior Developer"],
  ["mid", "Mid Developer"],
  ["senior", "Senior Engineer"],
  ["staff", "Staff Engineer"],
  ["principal", "Principal Engineer"],
  ["distinguished", "Distinguished Engineer"],
  ["fellow", "Fellow"],
]

await mkdir(`${OUT}/badges`, { recursive: true })
await mkdir(`${OUT}/cards`, { recursive: true })

let count = 0
const save = async (path, data) => {
  await writeFile(path, data)
  count++
}

for (const lang of LANGS) {
  for (const rank of HOF_RANKS) {
    await save(`${OUT}/badges/hof-rank${rank}-${lang}.svg`, buildHofBadgeSvg({ language: lang, rank, username: USER }))
  }
  await save(`${OUT}/badges/monthly-${lang}.svg`, buildMonthlyBadgeSvg({ language: lang, rank: 3, username: USER, yearMonth: "2026-06" }))
}

for (const lang of LANGS) {
  for (const rank of HOF_RANKS) {
    await save(`${OUT}/cards/hof-rank${rank}-${lang}.png`, await renderHallOfFameCard({ language: lang, rank, username: USER }))
  }
  await save(`${OUT}/cards/monthly-${lang}.png`, await renderMonthlyTopTenCard({ language: lang, rank: 3, username: USER, yearMonth: "2026-06" }))
}

for (const [slug, name] of GRADES) {
  await save(`${OUT}/cards/gradeup-${slug}.png`, await renderGradeUpCard({
    achievedAt: new Date("2026-06-29T00:00:00Z"),
    gradeName: name,
    gradeSlug: slug,
    userDisplayName: USER,
  }))
}

// --- 言語カラー見本（順位テーマの代わりに言語ブランドカラーで配色した版）---
const LANG_COLORS = {
  typescript: {
    badge: { accentFrom: "#6aa9f0", accentTo: "#2f6fc0", bgFrom: "#0d1b2e", bgTo: "#050b16" },
    card: { accent: "#cfe3ff", from: "#3178c6", to: "#10243f" },
  },
  javascript: {
    badge: { accentFrom: "#f7df1e", accentTo: "#b59a00", bgFrom: "#26220a", bgTo: "#120f04" },
    card: { accent: "#fff4b8", from: "#c9b200", to: "#2a2405" },
  },
  go: {
    badge: { accentFrom: "#5dd5f0", accentTo: "#00819e", bgFrom: "#06222a", bgTo: "#021016" },
    card: { accent: "#cdf3fc", from: "#00add8", to: "#053842" },
  },
}

await mkdir(`${OUT}/lang-colors/badges`, { recursive: true })
await mkdir(`${OUT}/lang-colors/cards`, { recursive: true })

for (const lang of LANGS) {
  const c = LANG_COLORS[lang]
  await save(`${OUT}/lang-colors/badges/hof-${lang}.svg`, buildHofBadgeSvg({ language: lang, rank: 1, username: USER, themeOverride: c.badge }))
  await save(`${OUT}/lang-colors/badges/monthly-${lang}.svg`, buildMonthlyBadgeSvg({ language: lang, rank: 3, username: USER, yearMonth: "2026-06", themeOverride: c.badge }))
  await save(`${OUT}/lang-colors/cards/hof-${lang}.png`, await renderHallOfFameCard({ language: lang, rank: 1, username: USER, themeOverride: c.card }))
  await save(`${OUT}/lang-colors/cards/monthly-${lang}.png`, await renderMonthlyTopTenCard({ language: lang, rank: 3, username: USER, yearMonth: "2026-06", themeOverride: c.card }))
}

console.log(`generated ${count} files into ${OUT}`)
