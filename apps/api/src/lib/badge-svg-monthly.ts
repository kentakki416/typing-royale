import type { RewardLanguage } from "../types/domain"

/**
 * 月間 TOP 10 バッジの SVG レンダリング（純粋関数）
 *
 * docs/spec/special-badges/step3-api-badge-special-svg.md 参照。全 rank で青固定。
 * yearMonth は "YYYY-MM" 形式で受け取り、表示は "YYYY.MM"。shimmer sweep と
 * pulsing border の SMIL アニメを含む
 */

export type MonthlyBadgeInput = {
    language: RewardLanguage
    rank: number
    username: string
    yearMonth: string
}

const THEME = {
  accentFrom: "#7dd3fc",
  accentTo: "#0c4a6e",
  bgFrom: "#0a1a26",
  bgTo: "#04101a",
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

const langLabel = (lang: RewardLanguage): string => lang === "typescript" ? "TS" : "JS"

/**
 * 月間 TOP 10 バッジ SVG を生成する。サイズは 360×80
 */
export const buildMonthlyBadgeSvg = (input: MonthlyBadgeInput): string => {
  const ym = input.yearMonth.replace("-", ".")
  const label = `${ym} #${input.rank} · ${langLabel(input.language)}`
  const username = escapeXml(input.username)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="80" viewBox="0 0 360 80">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${THEME.bgFrom}"/>
      <stop offset="100%" stop-color="${THEME.bgTo}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${THEME.accentFrom}"/>
      <stop offset="100%" stop-color="${THEME.accentTo}"/>
    </linearGradient>
    <linearGradient id="topHi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${THEME.accentFrom}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${THEME.accentFrom}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0"/>
      <stop offset="50%" stop-color="#e0f2fe" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#e0f2fe" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="clip">
      <rect width="360" height="80" rx="10"/>
    </clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="360" height="80" fill="url(#bg)"/>
    <rect width="360" height="40" fill="url(#topHi)"/>
    <rect x="-140" y="0" width="140" height="80" fill="url(#shimmer)" opacity="0.9" transform="skewX(-18)">
      <animate attributeName="x" from="-180" to="420" dur="3.4s" repeatCount="indefinite"/>
    </rect>
  </g>
  <rect width="360" height="80" rx="10" fill="none" stroke="url(#accent)" stroke-width="1.5">
    <animate attributeName="stroke-opacity" values="0.65;1;0.65" dur="2.4s" repeatCount="indefinite"/>
  </rect>
  <rect x="0" y="0" width="6" height="80" rx="3" fill="url(#accent)">
    <animate attributeName="opacity" values="0.85;1;0.85" dur="2.4s" repeatCount="indefinite"/>
  </rect>
  <text x="22" y="24" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="11" font-weight="700" fill="${THEME.accentFrom}" letter-spacing="2" style="filter: drop-shadow(0 0 4px ${THEME.accentFrom})">🏆 MONTHLY TOP 10</text>
  <text x="22" y="52" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="22" font-weight="900" fill="#fff" style="filter: drop-shadow(0 0 6px ${THEME.accentFrom})">${label}</text>
  <text x="22" y="71" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="12" font-weight="700" fill="${THEME.accentFrom}" opacity="0.9">@${username}</text>
  <text x="338" y="72" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="9" fill="${THEME.accentFrom}" opacity="0.55" text-anchor="end">typing-royale</text>
</svg>`
}
