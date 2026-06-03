import { logger } from "@repo/logger"

/**
 * 毎時ランキング集計バッチ CLI のエントリポイント（Phase 4 で本実装）。
 *
 * 言語別に top-1000 をヒープ抽出し、ranking_snapshots を更新。
 * 完了時に Redis 上のランキング系キャッシュキーを失効させる。
 */
const main = () => {
  logger.warn("batch:ranking is not implemented yet (Phase 4)")
}

main()
