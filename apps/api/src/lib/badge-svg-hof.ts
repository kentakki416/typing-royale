import type { RewardLanguage } from "../types/domain"

/**
 * Hall of Fame バッジの SVG レンダリング（純粋関数）
 *
 * docs/spec/special-badges/step3-api-badge-special-svg.md 参照。satori は使わず
 * 文字列テンプレートで生成。Rank に応じて色テーマ（1=金 / 2=銀 / 3=銅 / 4-10=黒メイン）
 * を切り替え、shimmer sweep と pulsing border の SMIL アニメを含む
 */

export type HofBadgeInput = {
    language: RewardLanguage
    rank: number
    username: string
}

type Theme = {
    accentFrom: string
    accentTo: string
    bgFrom: string
    bgTo: string
    emoji: string
}

const THEMES: Record<"1" | "2" | "3" | "rest", Theme> = {
  1: { accentFrom: "#ffd54a", accentTo: "#d2992a", bgFrom: "#1a1208", bgTo: "#0d0a04", emoji: "👑" },
  2: { accentFrom: "#e5e7eb", accentTo: "#6b7280", bgFrom: "#1a1a1c", bgTo: "#0a0a0b", emoji: "🥈" },
  3: { accentFrom: "#d97706", accentTo: "#78350f", bgFrom: "#1c130a", bgTo: "#0d0905", emoji: "🥉" },
  rest: { accentFrom: "#cbd5e1", accentTo: "#475569", bgFrom: "#1f2937", bgTo: "#030712", emoji: "💎" },
}

const getTheme = (rank: number): Theme => {
  if (rank === 1) return THEMES[1]
  if (rank === 2) return THEMES[2]
  if (rank === 3) return THEMES[3]
  return THEMES.rest
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
 * Hall of Fame バッジ SVG を生成する。サイズは 360×80（README 用、既存
 * /badge/:username.svg と並べて貼れるサイズ）
 */
export const buildHofBadgeSvg = (input: HofBadgeInput): string => {
  const theme = getTheme(input.rank)
  const label = `RANK #${input.rank} · ${langLabel(input.language)}`
  const username = escapeXml(input.username)

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
    <linearGradient id="topHi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.accentFrom}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${theme.accentFrom}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accentFrom}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${theme.accentFrom}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${theme.accentFrom}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="clip">
      <rect width="360" height="80" rx="10"/>
    </clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="360" height="80" fill="url(#bg)"/>
    <rect width="360" height="40" fill="url(#topHi)"/>
    <rect x="-140" y="0" width="140" height="80" fill="url(#shimmer)" opacity="0.85" transform="skewX(-18)">
      <animate attributeName="x" from="-180" to="420" dur="3.6s" repeatCount="indefinite"/>
    </rect>
  </g>
  <rect width="360" height="80" rx="10" fill="none" stroke="url(#accent)" stroke-width="1.5">
    <animate attributeName="stroke-opacity" values="0.65;1;0.65" dur="2.4s" repeatCount="indefinite"/>
  </rect>
  <rect x="0" y="0" width="6" height="80" rx="3" fill="url(#accent)">
    <animate attributeName="opacity" values="0.85;1;0.85" dur="2.4s" repeatCount="indefinite"/>
  </rect>
  <text x="22" y="24" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="11" font-weight="700" fill="${theme.accentFrom}" letter-spacing="2" style="filter: drop-shadow(0 0 4px ${theme.accentFrom})">${theme.emoji} HALL OF FAME</text>
  <text x="22" y="52" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="22" font-weight="900" fill="#fff" style="filter: drop-shadow(0 0 6px ${theme.accentFrom})">${label}</text>
  <text x="22" y="71" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="12" font-weight="700" fill="${theme.accentFrom}" opacity="0.9">@${username}</text>
  <text x="338" y="72" font-family="'Noto Sans JP','Helvetica',sans-serif" font-size="9" fill="${theme.accentFrom}" opacity="0.55" text-anchor="end">typing-royale</text>
</svg>`
}
