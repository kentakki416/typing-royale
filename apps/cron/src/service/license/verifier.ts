import { logger } from "@repo/logger"

import type { GithubClient } from "../../client/github"
import { retryWithBackoff } from "../../lib/retry"
import type {
  CrawledRepoRepository,
  ProblemRepository,
} from "../../repository/prisma"

/**
 * 既に登録済みの repo について、ライセンスが寛容ライセンス（MIT / Apache-2.0 /
 * BSD-3-Clause / ISC）から外れたものを disabled に倒し、その repo に紐づく
 * problems も一括無効化する月次バッチのロジック。
 *
 * - GitHub Repos API を repo ごとに 1 回叩く（rate limit はクライアントが処理）
 * - 個別 repo の失敗（404 や rate limit）は他に影響させず、その repo だけ skip して継続
 * - 5xx は retryWithBackoff で 3 回まで自動リトライ
 */

const ALLOWED_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"])

export type LicenseRecheckResult = {
  disabledProblems: number
  disabledRepos: number
  reposProcessed: number
}

export type LicenseRecheckDeps = {
  crawledRepoRepository: CrawledRepoRepository
  github: GithubClient
  problemRepository: ProblemRepository
}

export const licenseRecheck = async (deps: LicenseRecheckDeps): Promise<LicenseRecheckResult> => {
  const all = await deps.crawledRepoRepository.listForLicenseRecheck()
  let reposProcessed = 0
  let disabledRepos = 0
  let disabledProblems = 0
  for (const r of all) {
    try {
      const meta = await retryWithBackoff(async () => deps.github.getRepoMeta(r.owner, r.name))
      if (meta.license === null || !ALLOWED_LICENSES.has(meta.license)) {
        await deps.crawledRepoRepository.markDisabled(r.id, "license_changed")
        const count = await deps.problemRepository.markDisabledByCrawledRepoId(r.id)
        disabledRepos++
        disabledProblems += count
        logger.warn("licenseRecheck: repo disabled", {
          count,
          fullName: r.fullName,
          license: meta.license,
        })
      }
    } catch (err) {
      logger.warn("licenseRecheck: failed to recheck", {
        err: String(err),
        fullName: r.fullName,
      })
    }
    reposProcessed++
  }
  return { disabledProblems, disabledRepos, reposProcessed }
}
