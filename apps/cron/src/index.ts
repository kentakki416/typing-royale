import { logger } from "@repo/logger"

/**
 * cron パッケージのデフォルトエントリポイント。
 *
 * 実際のクローラ / バッチ処理は `src/task/` 配下のエントリから起動する:
 *   - `pnpm crawler:run:typescript`  : TypeScript 週次クローラ
 *   - `pnpm crawler:license-recheck` : 月次ライセンス再検証（言語非依存）
 *
 * ランキング集計は cron を持たない。月間ランキングは v2 で `/finish` 同期 UPSERT に、
 * オールタイムランキングは `user_language_best` のリアルタイム集計に移行済み
 * (docs/spec/monthly-ranking/README.md / docs/spec/score-ranking/README.md 参照)
 *
 * このファイルは `pnpm dev` で起動した際のエントリ。現時点では起動確認のみ。
 */
const main = () => {
  logger.info("cron package booted", { env: process.env.NODE_ENV ?? "local" })
}

main()
