import { logger } from "@repo/logger"

/**
 * cron パッケージのデフォルトエントリポイント。
 *
 * 実際のクローラ / バッチ処理は `src/task/` 配下のエントリから起動する:
 *   - `pnpm crawler:run:typescript`  : TypeScript 週次クローラ
 *   - `pnpm crawler:license-recheck` : 月次ライセンス再検証（言語非依存）
 *
 * `pnpm batch:ranking` は未実装（src/task/ranking-batch.ts はスタブ）。
 *
 * このファイルは `pnpm dev` で起動した際のエントリ。現時点では起動確認のみ。
 */
const main = () => {
  logger.info("cron package booted", { env: process.env.NODE_ENV ?? "local" })
}

main()
