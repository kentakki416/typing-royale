/**
 * ユーザードメイン型（認証プロバイダー非依存）
 */
export type User = {
    avatarUrl: string | null
    /**
     * false の場合はランキング集計対象から完全に除外される（順位そのものが計算されない）
     */
    canPublicRanking: boolean
    createdAt: Date
    /**
     * GitHub OAuth ログイン時に取得した username (login)。 表示は `@<username>` で統一。
     * dev-login ユーザーや GitHub OAuth 以前のユーザーは null
     */
    githubUsername: string | null
    /**
     * dev-login や将来のメール連絡用にオプショナルで保持（MVP の GitHub OAuth では収集しない）
     */
    email: string | null
    /**
     * プロフィール公開用の「お気に入りリポジトリ URL」（マイページから設定）
     */
    favoriteRepoUrl: string | null
    id: number
    updatedAt: Date
}
