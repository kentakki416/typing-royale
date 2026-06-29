import type { RewardLanguage } from "./types"

/**
 * 言語 slug → バッジ / カードに表示するラベルへの変換（純粋関数）。
 *
 * reward は言語マスタ (languages テーブル) 駆動で汎用化されており、新しい言語が
 * 追加されても **コード変更なし** で表示できるよう、未知の slug は「先頭大文字」へ
 * フォールバックする（例: "go" → "Go", "rust" → "Rust"）。"JS" / "TS" のように
 * 慣用的な短縮形がある言語だけ override マップで上書きする。
 */

/**
 * 先頭一文字を大文字化する。空文字はそのまま返す。
 */
const capitalize = (slug: string): string =>
  slug.length === 0 ? slug : `${slug.charAt(0).toUpperCase()}${slug.slice(1)}`

/**
 * バッジ用の短縮ラベル（例: "JS" / "TS" / "Go"）。
 */
const SHORT_LABEL_OVERRIDES: Record<string, string> = {
  javascript: "JS",
  typescript: "TS",
}

/**
 * カード用の表示名（例: "JavaScript" / "TypeScript" / "Go"）。
 */
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
}

export const languageShortLabel = (slug: RewardLanguage): string =>
  SHORT_LABEL_OVERRIDES[slug] ?? capitalize(slug)

export const languageDisplayName = (slug: RewardLanguage): string =>
  DISPLAY_NAME_OVERRIDES[slug] ?? capitalize(slug)
