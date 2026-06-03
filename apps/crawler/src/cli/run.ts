import { logger } from "../log"

/**
 * 週次クローラ CLI のエントリポイント（Phase 2 で本実装）。
 *
 * 実装予定:
 *   1. crawler_runs に running レコードを作成（同日二重起動防止）
 *   2. pickNextRepo() で未クロールの最上位 repo を選定
 *   3. processRepo() でメタ取得 → ファイル取得 → AST 抽出 → 問題化
 *   4. crawler_runs を completed に更新
 */
const main = () => {
  logger.warn("crawler:run is not implemented yet (Phase 2)")
}

main()
