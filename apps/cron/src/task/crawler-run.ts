import { logger } from "@repo/logger"

/**
 * crawler:run - 週次クローラの起動エントリ（Phase 2 で本実装）。
 *
 * このファイル自体は env を組み立てて `service/crawler/` の処理を呼ぶ薄い 1 枚に
 * 保つ。業務ロジック（pickNextRepo / processRepo / run 追跡）は `service/crawler/`
 * 配下で実装し、license-recheck と共有できるところは service 側で集約する。
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
