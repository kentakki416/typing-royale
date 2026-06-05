/**
 * GitHub 上のファイル行範囲を指す permalink を生成する。
 *
 * commit SHA を含めるため、後からファイルが書き換わってもリンク先のコードは
 * クロール時点と同じものが見える（problem-pool の sourceUrl で使う）。
 *
 * 例:
 *   https://github.com/colinhacks/zod/blob/abc123/src/parse.ts#L123-L145
 */
export const buildSourceUrl = (
  owner: string,
  repo: string,
  commitSha: string,
  filePath: string,
  lineStart: number,
  lineEnd: number
): string =>
  `https://github.com/${owner}/${repo}/blob/${commitSha}/${filePath}#L${lineStart}-L${lineEnd}`
