/**
 * 達成日表示用の日付フォーマッタ。 API レスポンスは ISO 8601 文字列で、 表示は
 * JST (Asia/Tokyo) 暦日に統一する
 */
export const formatPlayedAtDate = (iso: string): string => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(iso)).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  )
  return `${parts.year}/${parts.month}/${parts.day}`
}

/**
 * 同じ年内の短縮版 (MM/DD)。 月間ランキングの「達成日」列で使う
 */
export const formatPlayedAtShort = (iso: string): string => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(iso)).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  )
  return `${parts.month}/${parts.day}`
}
