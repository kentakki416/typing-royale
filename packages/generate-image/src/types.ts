/**
 * generate-image パッケージ内で使う型定義
 *
 * apps/api の domain 型 (`RewardLanguage` 等) と意図的に重複させている。
 * 共通 schema package に移すと依存方向が逆転する (packages → packages/schema) ため、
 * 本パッケージは「画像生成に必要な最小限の型」だけを内部で持つ。
 */

/**
 * reward の対象言語 slug（例: "javascript" / "typescript" / "go"）。
 *
 * reward は言語マスタ (languages テーブル) 駆動で汎用化されており、特定の言語に
 * 限定しない。新しい言語がマスタに追加されればコード変更なしで reward 対象になる。
 * 表示ラベルは languageShortLabel / languageDisplayName で解決する。
 */
export type RewardLanguage = string
