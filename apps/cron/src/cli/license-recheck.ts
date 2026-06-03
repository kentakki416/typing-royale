import { logger } from "@repo/logger"

/**
 * 月次ライセンス再検証 CLI のエントリポイント（Phase 2 で本実装）。
 *
 * crawled_repos のライセンスを最新の GitHub Repos API で再取得し、
 * 寛容ライセンスから外れた repo を disabled=true にする。
 */
const main = () => {
  logger.warn("crawler:license-recheck is not implemented yet (Phase 2)")
}

main()
