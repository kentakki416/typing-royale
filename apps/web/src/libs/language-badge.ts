/**
 * 言語バッジ / ラベルの表示ヘルパ（言語マスタ駆動）。
 *
 * reward / ranking と同じ方針で、特定言語にハードコードせず言語マスタ
 * (languages テーブル) の slug を起点に表示する。慣用色・短縮形のある言語だけ
 * override で固定し、未知の言語は palette 巡回 / 先頭大文字で自動対応する
 * （言語がマスタに追加されればコード変更なしで表示される）。
 */

const BADGE_CLASS_BY_SLUG: Record<string, string> = {
  go: "success",
  javascript: "warning",
  typescript: "accent",
}

const BADGE_CLASS_PALETTE = ["accent", "warning", "success", "pink"]

/**
 * 対応言語バッジの色クラス。override が無ければ index で palette を巡回する。
 */
export const languageBadgeClass = (slug: string, index: number): string =>
  BADGE_CLASS_BY_SLUG[slug] ?? BADGE_CLASS_PALETTE[index % BADGE_CLASS_PALETTE.length]

const SHORT_LABEL_BY_SLUG: Record<string, string> = {
  javascript: "JS",
  typescript: "TS",
}

/**
 * バッジ等で使う短縮ラベル（例: "JS" / "TS" / "Go"）。
 * override が無ければ先頭大文字でフォールバックする。slug 不明時は "?"。
 */
export const languageShortLabel = (slug: string | undefined): string => {
  if (!slug) return "?"
  return SHORT_LABEL_BY_SLUG[slug] ?? `${slug.charAt(0).toUpperCase()}${slug.slice(1)}`
}
