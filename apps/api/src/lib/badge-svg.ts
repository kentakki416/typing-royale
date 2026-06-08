/**
 * 動的 SVG バッジのレンダリング（純粋関数）
 *
 * テーマは持たず常に黒背景で統一。docs/spec/rewards/step2-api-badge-svg.md
 * 「SVG 生成ロジック」参照。satori を使わず文字列テンプレートで生成する
 */

export type BadgeData = {
    username: string
    grade: { name: string; slug: string }
    bestScore: number
    rank: number | null
    streakDays: number
    typedChars: number
}

export type BuildBadgeInput = {
    data: BadgeData
    displayItems: string[]
}

const WIDTH = 280
const PADDING_X = 16
const HEADER_HEIGHT = 32
const LINE_HEIGHT = 22
const FOOTER_HEIGHT = 12

/**
 * テーマは一本化（黒背景）
 */
const PALETTE = {
  accent: "#d29922",
  background: "#0d1117",
  border: "#30363d",
  muted: "#8b949e",
  text: "#e6edf3",
}

const ITEM_LABELS: Record<string, string> = {
  best_score: "Best",
  grade: "Grade",
  rank: "TS Rank",
  streak_days: "Streak",
  typed_chars: "Typed",
  username: "User",
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

const formatItemValue = (slug: string, data: BadgeData): string => {
  switch (slug) {
  case "best_score":
    return `${data.bestScore.toLocaleString()} pts`
  case "grade":
    return data.grade.name
  case "rank":
    return data.rank === null ? "—" : `#${data.rank}`
  case "streak_days":
    return `${data.streakDays} 日`
  case "typed_chars":
    return `${data.typedChars.toLocaleString()} chars`
  case "username":
    return `@${data.username}`
  default:
    return ""
  }
}

/**
 * バッジ SVG を生成する
 *
 * 縦方向のレイアウト:
 *   [Header] Typing Royale ロゴ (32px)
 *   [Lines] displayItems 各 1 行 (22px × N)
 *   [Footer] 小さい余白 (12px)
 */
export const buildBadgeSvg = ({ data, displayItems }: BuildBadgeInput): string => {
  const itemCount = displayItems.length
  const height = HEADER_HEIGHT + itemCount * LINE_HEIGHT + FOOTER_HEIGHT

  const headerY = 22
  const linesStartY = HEADER_HEIGHT + 16

  const lines = displayItems
    .map((slug, idx) => {
      const label = ITEM_LABELS[slug] ?? slug
      const value = formatItemValue(slug, data)
      const y = linesStartY + idx * LINE_HEIGHT
      const isGrade = slug === "grade"
      const valueColor = isGrade ? PALETTE.accent : PALETTE.text
      const valueWeight = isGrade ? "600" : "500"
      return (
        `  <text fill="${PALETTE.muted}" font-family="system-ui, -apple-system, sans-serif" font-size="12" x="${PADDING_X}" y="${y}">${escapeXml(label)}</text>\n`
        + `  <text fill="${valueColor}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="${valueWeight}" text-anchor="end" x="${WIDTH - PADDING_X}" y="${y}">${escapeXml(value)}</text>`
      )
    })
    .join("\n")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" xml:lang="ja">
  <rect width="${WIDTH}" height="${height}" fill="${PALETTE.background}" rx="6"/>
  <rect width="${WIDTH}" height="${height}" fill="none" stroke="${PALETTE.border}" rx="6"/>
  <text fill="${PALETTE.accent}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" x="${PADDING_X}" y="${headerY}">Typing Royale</text>
  <text fill="${PALETTE.muted}" font-family="system-ui, -apple-system, sans-serif" font-size="11" text-anchor="end" x="${WIDTH - PADDING_X}" y="${headerY}">@${escapeXml(data.username)}</text>
${lines}
</svg>`
}

/**
 * 非公開 / 存在しないユーザー向けの固定バッジ
 */
export const getPrivateBadgeSvg = (): string => {
  const width = 280
  const height = 60
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${PALETTE.background}" rx="6"/>
  <rect width="${width}" height="${height}" fill="none" stroke="${PALETTE.border}" rx="6"/>
  <text fill="${PALETTE.accent}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" x="16" y="24">Typing Royale</text>
  <text fill="${PALETTE.muted}" font-family="system-ui, -apple-system, sans-serif" font-size="12" x="16" y="46">Private or not found</text>
</svg>`
}

/**
 * バリデーション失敗時の固定バッジ (Cache-Control を効かせるため 200 で返す)
 */
export const getBadRequestBadgeSvg = (): string => {
  const width = 280
  const height = 60
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${PALETTE.background}" rx="6"/>
  <rect width="${width}" height="${height}" fill="none" stroke="${PALETTE.border}" rx="6"/>
  <text fill="${PALETTE.accent}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" x="16" y="24">Typing Royale</text>
  <text fill="${PALETTE.muted}" font-family="system-ui, -apple-system, sans-serif" font-size="12" x="16" y="46">Invalid username</text>
</svg>`
}
