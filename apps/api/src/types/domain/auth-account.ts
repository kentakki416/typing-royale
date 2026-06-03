import { User } from "./user"

/**
 * 認証アカウントドメイン型
 */
export type AuthAccount = {
    accessToken: string | null
    createdAt: Date
    expiresAt: number | null
    id: number
    idToken: string | null
    provider: string
    providerAccountId: string
    refreshToken: string | null
    scope: string | null
    tokenType: string | null
    updatedAt: Date
    userId: number
}

/**
 * ユーザー情報を含む認証アカウント（リレーション含む取得）
 */
export type AuthAccountWithUser = AuthAccount & {
    user: User
}
