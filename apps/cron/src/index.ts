import { logger } from "@repo/logger"

/**
 * cron パッケージのデフォルトエントリポイント。
 *
 * 実際のクローラ / バッチ処理は `src/task/` 配下のエントリから起動する:
 *   - `pnpm crawler:run:typescript`  : TypeScript 週次クローラ（Phase 2）
 *   - `pnpm crawler:license-recheck` : 月次ライセンス再検証（Phase 2、言語非依存）
 *   - `pnpm batch:ranking`           : 毎時ランキング集計（Phase 4）
 *
 * このファイルは `pnpm dev` で起動した際のエントリ。Phase 0 では起動確認のみ。
 */
const main = () => {
  logger.info("cron package booted", { env: process.env.NODE_ENV ?? "local" })
}

main()
