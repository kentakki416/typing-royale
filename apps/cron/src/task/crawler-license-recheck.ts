import { logger } from "@repo/logger"

/**
 * crawler:license-recheck - 月次ライセンス再検証の起動エントリ（Phase 2 で本実装）。
 *
 * crawled_repos のライセンスを最新の GitHub Repos API で再取得し、寛容ライセンス
 * から外れた repo を disabled=true にする。再検証ロジック自体は `service/license/`
 * に置き、ここからは env を組み立てて呼ぶだけにする。
 */
const main = () => {
  logger.warn("crawler:license-recheck is not implemented yet (Phase 2)")
}

main()
