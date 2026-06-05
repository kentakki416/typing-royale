import { logger } from "@repo/logger"

import type { CrawlerRunRepository } from "../../repository/prisma"

/**
 * crawler_runs に run 単位の親レコードを記録するラッパ。
 *
 * 同日二重起動防止と stale running の自動 failed 化を兼ねる：
 *   1. `started_at < now - 30min` の running 行を failed に遷移（前回 SIGKILL / OOM の救済）
 *   2. 同日（JST 00:00 起点）に running / success の行があれば skip して return（成功扱い）
 *   3. running で start → body を実行 → 成功なら succeed、例外で fail + rethrow
 *
 * `forceRerun=true` で 2 をバイパスできる（ローカル再実行用）。`now` を DI 可能に
 * しているのは Repository の同日判定をテストで固定時刻に揃えるため。
 */

export type RunWithCrawlerRunTrackingOptions = {
  forceRerun?: boolean
  /** テスト時に固定時刻を渡せるよう DI */
  now?: () => Date
}

export const runWithCrawlerRunTracking = async (
  runType: "full" | "license_recheck",
  deps: { crawlerRunRepository: CrawlerRunRepository },
  body: (runId: number) => Promise<{ problemsAdded: number; reposProcessed: number }>,
  options: RunWithCrawlerRunTrackingOptions = {}
): Promise<void> => {
  const now = options.now ?? (() => new Date())

  /** 1. stale running を自動 failed 化 */
  const staleCount = await deps.crawlerRunRepository.markStaleAsFailed(runType, now())
  if (staleCount > 0) {
    logger.warn("crawler_run: stale running marked as failed", { runType, staleCount })
  }

  /** 2. 同日チェック */
  if (!options.forceRerun) {
    const exists = await deps.crawlerRunRepository.existsActiveRunToday(runType, now())
    if (exists) {
      logger.info("crawler_run: skipped, active run exists today", { runType })
      return
    }
  }

  const { id } = await deps.crawlerRunRepository.start({ runType, startedAt: now() })

  try {
    const result = await body(id)
    await deps.crawlerRunRepository.succeed(id, now(), result.reposProcessed, result.problemsAdded)
  } catch (err) {
    await deps.crawlerRunRepository.fail(id, now(), err)
    throw err
  }
}
