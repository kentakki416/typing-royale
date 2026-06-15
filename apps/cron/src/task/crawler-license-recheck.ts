import { GithubClient } from "../client/github"
import { env } from "../env"
import {
  PrismaCrawledRepoRepository,
  PrismaProblemRepository,
} from "../repository/prisma"
import { runAsCrawlerJob } from "../runtime/run-as-crawler-job"
import { licenseRecheck } from "../service/license/verifier"

const RUN_TYPE = "license_recheck"
const TASK_NAME = "crawler-license-recheck"

/**
 * crawler:license-recheck - 月次ライセンス再検証の起動エントリ。
 *
 * 既存の crawled_repos のうち disabled=false の全 repo について GitHub Repos API
 * で最新ライセンスを取り直し、寛容ライセンスから外れたものを disabled に倒す。
 * 同 repo に紐づく problems も一括無効化する。
 *
 * run 全体は `crawler_runs` に start → succeed/fail を直接記録する（runtime が担当）。
 * 個別 repo の履歴（crawler_run_items）は使わない（失敗 / 成功は logger.warn で十分）。
 *
 * 集計セマンティクス:
 *   - reposProcessed: 再検証した repo 総数
 *   - problemsAdded : 無効化した problems 総数（追加ではなく削除側だが、
 *     run のインパクト指標として記録する）
 */
runAsCrawlerJob({
  exec: async ({ prisma, signal }) => {
    const github = new GithubClient({
      fetchTimeoutMs: env.GITHUB_FETCH_TIMEOUT_MS,
      minStars: env.CRAWLER_MIN_STARS,
      pat: env.GITHUB_PAT,
      pushedAfter: env.CRAWLER_PUSHED_AFTER,
    })
    const crawledRepoRepository = new PrismaCrawledRepoRepository(prisma)
    const problemRepository = new PrismaProblemRepository(prisma)

    const result = await licenseRecheck(
      { crawledRepoRepository, problemRepository },
      { github },
      { signal }
    )
    return {
      problemsAdded: result.disabledProblems,
      reposProcessed: result.reposProcessed,
    }
  },
  runType: RUN_TYPE,
  taskName: TASK_NAME,
})
