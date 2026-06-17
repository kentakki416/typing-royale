/**
 * ユーザー識別子の表示用フォーマッタ。
 *
 * GitHub OAuth ログインユーザーは `github_username` (= GitHub login) を持つので
 * そのまま表示。 dev-login ユーザーや GitHub OAuth 以前のユーザーは null になる
 * ので、 User id を使った `user{N}` で安定フォールバックする
 */
export const formatUsername = (
  user: { github_username: string | null; id: number },
): string => user.github_username ?? `user${user.id}`
