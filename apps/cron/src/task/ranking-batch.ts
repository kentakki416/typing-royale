import { logger } from "@repo/logger"

/**
 * batch:ranking - 毎時ランキング集計の起動エントリ（未実装）。
 *
 * 言語別に top-1000 をヒープ抽出し、ranking_snapshots を更新。完了時に Redis 上の
 * ランキング系キャッシュキーを失効させる。集計ロジックは `service/ranking/` に置き、
 * ここからは Prisma client を組み立てて RankingAggregator を呼ぶだけにする。
 */
const main = () => {
  logger.warn("batch:ranking is not implemented yet")
}

main()
