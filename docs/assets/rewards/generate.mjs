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
const LANGS = ["typescript", "javascript"]
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

console.log(`generated ${count} files into ${OUT}`)
