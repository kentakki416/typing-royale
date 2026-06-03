import { logger } from "./log"

/**
 * crawler パッケージのデフォルトエントリポイント。
 *
 * 実際のクローラ / バッチ処理は `src/cli/` 配下の CLI コマンドから呼び出す:
 *   - `pnpm crawler:run`            : 週次クローラ（Phase 2）
 *   - `pnpm crawler:license-recheck`: 月次ライセンス再検証（Phase 2）
 *   - `pnpm batch:ranking`          : 毎時ランキング集計（Phase 4）
 *
 * このファイルは `pnpm dev` で起動した際のエントリ。Phase 0 では起動確認のみ。
 */
const main = () => {
  logger.info({ env: process.env.NODE_ENV ?? "local" }, "crawler package booted")
}

main()
