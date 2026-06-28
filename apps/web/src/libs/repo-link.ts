/**
 * プロフィールに表示する「リポジトリ / GitHub リンク」の整形。
 *
 * favoriteRepoUrl が未設定 (null) の場合は GitHub プロフィール URL
 * (github.com/{username}) にフォールバックする。表示ラベルは:
 * - github.com/owner/repo  → "owner/repo"
 * - github.com/username    → "@username"（プロフィール URL）
 * - それ以外の URL         → URL をそのまま
 */
export type RepoLink = {
  href: string
  label: string
}

export const resolveRepoLink = (
  favoriteRepoUrl: string | null,
  username: string,
): RepoLink => {
  const href = favoriteRepoUrl ?? `https://github.com/${username}`
  return { href, label: formatRepoLabel(href) }
}

const formatRepoLabel = (url: string): string => {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === "github.com") {
      const parts = parsed.pathname.split("/").filter((s) => s.length > 0)
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
      if (parts.length === 1) return `@${parts[0]}`
    }
    return url
  } catch {
    return url
  }
}
