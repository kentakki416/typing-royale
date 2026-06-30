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

/**
 * href として安全に出力できる http(s) URL かを判定する。
 * `javascript:` / `data:` 等のスキームは false（公開プロフィールでの XSS を防ぐ多層防御）。
 */
const isSafeHttpUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export const resolveRepoLink = (
  favoriteRepoUrl: string | null,
  username: string,
): RepoLink => {
  /**
   * 入力検証をすり抜けて保存された不正スキームの値に備え、出力直前にも http(s) を強制する。
   * 安全でなければ GitHub プロフィール URL にフォールバックする。
   */
  const safeUrl = favoriteRepoUrl !== null && isSafeHttpUrl(favoriteRepoUrl) ? favoriteRepoUrl : null
  const href = safeUrl ?? `https://github.com/${username}`
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
