/**
 * generate-image パッケージ内で使う型定義
 *
 * apps/api の domain 型 (`RewardLanguage` 等) と意図的に重複させている。
 * 共通 schema package に移すと依存方向が逆転する (packages → packages/schema) ため、
 * 本パッケージは「画像生成に必要な最小限の型」だけを内部で持つ。
 *
 * apps/api 側の domain 型と「同じ値」であることは命名規約と eslint の enum 制約で
 * 保つ (将来増えたら CI で diff チェックを入れても良い)
 */

export type RewardLanguage = "javascript" | "typescript"
