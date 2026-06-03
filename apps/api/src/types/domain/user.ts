/**
 * ユーザードメイン型
 *
 * displayName は GitHub username 等を初期値に持つ表示名。
 * publicRanking が false の場合はランキング集計対象から完全に除外される。
 */
export type User = {
    avatarUrl: string | null
    createdAt: Date
    displayName: string | null
    email: string | null
    id: number
    publicRanking: boolean
    updatedAt: Date
}
