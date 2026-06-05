import type { GithubClient } from "../../client/github"

import type { CrawledRepoRepository } from "./crawled-repo-repository"

/**
 * Search Repositories の結果を上から走査し、まだ DB に登録されていない最初の repo
 * を返す。
 *
 * 1 ページ 100 件 × 最大 10 ページ（GitHub Search の上限 1000 件）を走査し、
 * 全件登録済み or 100 件未満で終端なら `null`。disabled の repo も「再度試さない」
 * 対象に含めるため、`listRegisteredFullNames` は disabled の有無を問わず全件返す。
 */
export const pickNextRepo = async (
  language: { id: number; slug: string },
  deps: { crawledRepoRepository: CrawledRepoRepository; github: GithubClient }
): Promise<{ name: string; owner: string } | null> => {
  const registered = await deps.crawledRepoRepository.listRegisteredFullNames(language.id)
  for (let page = 1; page <= 10; page++) {
    const result = await deps.github.searchRepos(language.slug, page)
    for (const item of result.items) {
      if (!registered.has(item.fullName)) {
        return { name: item.name, owner: item.owner }
      }
    }
    if (result.items.length < 100) break
  }
  return null
}
