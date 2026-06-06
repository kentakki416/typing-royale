import * as ts from "typescript"

import { logger } from "@repo/logger"

import { checkAdoption } from "../../ast/adoption-check"
import { extractFunctions } from "../../ast/extract-functions"
import { astHashOf } from "../../ast/normalize-for-hash"
import { removeComments } from "../../ast/remove-comments"
import type { GithubClient, GithubRepoMeta } from "../../client/github"
import { retryWithBackoff } from "../../lib/retry"
import { buildSourceUrl } from "../../lib/source-url"
import type {
  CrawledRepoRepository,
  CreateProblemInput,
  ProblemRepository,
} from "../../repository/prisma"

const MIN_ELIGIBLE = 30
const SAMPLE_CAP = 100
const ALLOWED_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"])

export type ProcessRepoTarget = {
  languageId: number
  name: string
  owner: string
}

export type ProcessRepoResult =
  | { adopted: true; candidatesCount: number; problemsAdded: number; storedCount: number }
  | { adopted: false; candidatesCount: number; reason: "license_not_allowed" | "too_few_problems" }

export type ProcessRepoRepo = {
  crawledRepoRepository: CrawledRepoRepository
  problemRepository: ProblemRepository
}

export type ProcessRepoClient = {
  github: GithubClient
}

/**
 * 1 repo を「メタ取得 → ファイル一覧 → AST 抽出 → DB 保存」まで処理する service。
 *
 * 戻り値は **正常フロー上の分岐結果**を表す plain union（`Result` ラップしない）。
 *   - adopted=true  : 採用候補 ≥ MIN_ELIGIBLE で crawled_repos + problems を保存
 *   - adopted=false : ライセンス NG or 採用候補不足 → crawled_repos に disabled=true で記録、problems は空
 *
 * 想定外（API 5xx 3 回連続失敗、DB 障害）は throw して呼び出し側（task）の
 * try-catch で crawler_run_items を failed に記録する。
 */
export const processRepo = async (
  target: ProcessRepoTarget,
  repo: ProcessRepoRepo,
  client: ProcessRepoClient
): Promise<ProcessRepoResult> => {
  const fullName = `${target.owner}/${target.name}`
  logger.info("processRepo: start", { fullName })

  /** 1. 最新メタ + HEAD SHA を取得（5xx は retryWithBackoff で 3 回まで） */
  const meta = await retryWithBackoff(async () => client.github.getRepoMeta(target.owner, target.name))

  /** 2. ライセンス確認 */
  if (meta.license === null || !ALLOWED_LICENSES.has(meta.license)) {
    await persistDisabled(target, meta, "license_not_allowed", repo, 0)
    return { adopted: false, candidatesCount: 0, reason: "license_not_allowed" }
  }

  /** 3. フィルタリング済みの対象ソースファイル一覧 */
  const files = await client.github.listSourceFiles(target.owner, target.name, meta.commitSha)

  /** 4. 各ファイルから採用候補を抽出（repo 内重複は Map で事前 dedupe） */
  const candidateMap = new Map<string, CreateProblemInput>()
  for (const file of files) {
    try {
      // ソースファイルのコードを取得
      const raw = await client.github.getRawContent(target.owner, target.name, meta.commitSha, file.path)
      // ソースコード文字列を元にASTを作る
      const sf = ts.createSourceFile(file.path, raw, ts.ScriptTarget.Latest, true)
      for (const fn of extractFunctions(sf)) {
        const stripped = removeComments(fn.rawText)
        const adoption = checkAdoption(fn.functionName, stripped)
        if (!adoption.adopted) continue
        const hash = astHashOf(stripped)
        /** repo 内の同 hash は最初の 1 件だけ採用 */
        if (candidateMap.has(hash)) continue
        candidateMap.set(hash, {
          astHash: hash,
          charCount: adoption.charCount,
          codeBlock: stripped.trim(),
          crawledRepoId: 0,
          functionName: fn.functionName,
          languageId: target.languageId,
          lineCount: adoption.lineCount,
          sourceFilePath: file.path,
          sourceLineEnd: fn.sourceLineEnd,
          sourceLineStart: fn.sourceLineStart,
          sourceUrl: buildSourceUrl(
            target.owner,
            target.name,
            meta.commitSha,
            file.path,
            fn.sourceLineStart,
            fn.sourceLineEnd
          ),
        })
      }
    } catch (err) {
      logger.warn("processRepo: file parse failed", { err: String(err), path: file.path })
    }
  }

  const candidates = Array.from(candidateMap.values())
  const candidatesCount = candidates.length

  /** 5. repo 単位の足切り */
  if (candidatesCount < MIN_ELIGIBLE) {
    await persistDisabled(target, meta, "too_few_problems", repo, candidatesCount)
    return { adopted: false, candidatesCount, reason: "too_few_problems" }
  }

  /** 6. ランダムサンプリング（> 100 なら 100 件） */
  const sampled =
    candidatesCount > SAMPLE_CAP ? shuffle(candidates).slice(0, SAMPLE_CAP) : candidates

  /** 7. crawled_repos INSERT → problems bulkCreate */
  const crawledRepo = await repo.crawledRepoRepository.create({
    candidatesCount,
    commitSha: meta.commitSha,
    crawledAt: new Date(),
    defaultBranch: meta.defaultBranch,
    description: meta.description,
    disabled: false,
    disabledReason: null,
    fullName: meta.fullName,
    githubId: BigInt(meta.id),
    homepage: meta.homepage,
    languageId: target.languageId,
    license: meta.license,
    name: meta.name,
    owner: meta.owner,
    stars: meta.stars,
    storedCount: sampled.length,
    topics: meta.topics,
  })

  const problemsWithRepoId = sampled.map((p) => ({ ...p, crawledRepoId: crawledRepo.id }))
  const problemsAdded = await repo.problemRepository.bulkCreateSkippingDuplicates(problemsWithRepoId)

  /** sampled.length とズレた場合は cross-repo dedupe で skip された */
  if (problemsAdded < sampled.length) {
    logger.info("processRepo: some problems skipped by cross-repo dedupe", {
      fullName,
      skipped: sampled.length - problemsAdded,
    })
  }

  logger.info("processRepo: done", { candidatesCount, fullName, problemsAdded })
  return { adopted: true, candidatesCount, problemsAdded, storedCount: sampled.length }
}

/**
 * クローリングしたRepositoryをDB:crawledRepositoryに失敗としてい記録する
 */
const persistDisabled = async (
  target: ProcessRepoTarget,
  meta: GithubRepoMeta,
  reason: string,
  repo: { crawledRepoRepository: CrawledRepoRepository },
  candidatesCount: number
): Promise<void> => {
  await repo.crawledRepoRepository.create({
    candidatesCount,
    commitSha: meta.commitSha,
    crawledAt: new Date(),
    defaultBranch: meta.defaultBranch,
    description: meta.description,
    disabled: true,
    disabledReason: reason,
    fullName: meta.fullName,
    githubId: BigInt(meta.id),
    homepage: meta.homepage,
    languageId: target.languageId,
    license: meta.license ?? "",
    name: meta.name,
    owner: meta.owner,
    stars: meta.stars,
    storedCount: 0,
    topics: meta.topics,
  })
}

const shuffle = <T>(arr: T[]): T[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
