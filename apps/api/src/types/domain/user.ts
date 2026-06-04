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
     * GitHub username 等を初期値に持つ、ユーザー表示用の名前
     */
    displayName: string | null
    /**
     * dev-login や将来のメール連絡用にオプショナルで保持（MVP の GitHub OAuth では収集しない）
     */
    email: string | null
    id: number
    updatedAt: Date
}
