import { User } from "./user"

/**
 * 認証アカウントドメイン型
 *
 * OAuth プロバイダのアクセストークンは保持しない（docs/spec/github-auth/README.md 参照）。
 * (provider, providerAccountId) で一意に識別する。
 */
export type AuthAccount = {
    createdAt: Date
    id: number
    provider: string
    providerAccountId: string
    updatedAt: Date
    userId: number
}

/**
 * ユーザー情報を含む認証アカウント（リレーション含む取得）
 */
export type AuthAccountWithUser = AuthAccount & {
    user: User
}
