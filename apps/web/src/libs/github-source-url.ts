/**
 * 問題の source_url（GitHub blob URL）から "{owner}/{repo}" + ファイルパス + 行範囲を抽出する。
 *
 * 例: https://github.com/microsoft/vscode/blob/<sha>/src/vs/foo.ts#L1-L10
 *     → { repo: "microsoft/vscode", path: "src/vs/foo.ts", lineRange: "L1-L10" }
 *
 * 単一行 (`#L42`) は lineRange = "L42"、フラグメント無しは null。
 * URL 全体が想定外フォーマットなら null を返す（呼び出し側で function_name 等にフォールバック）。
 */
export const extractRepoAndPathFromGithubUrl = (
  url: string,
): { lineRange: string | null; path: string; repo: string } | null => {
  try {
    const u = new URL(url)
    if (u.host !== "github.com") return null
    const parts = u.pathname.split("/").filter((p) => p !== "")
    /** ["{owner}", "{repo}", "blob", "{ref}", ...path] */
    if (parts.length < 5 || parts[2] !== "blob") return null
    /** GitHub の行範囲フラグメント "L132-L136" / "L42" のみ採用 */
    const hash = u.hash.replace(/^#/, "")
    const lineRange = /^L\d+(-L\d+)?$/.test(hash) ? hash : null
    return {
      lineRange,
      path: parts.slice(4).join("/"),
      repo: `${parts[0]}/${parts[1]}`,
    }
  } catch {
    return null
  }
}
