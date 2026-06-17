import { User } from "./user"

/**
 * 認証アカウントドメイン型（複数プロバイダー対応、 (provider, providerAccountId) で一意）
 *
 * OAuth プロバイダのアクセストークンは保持しない（docs/spec/github-auth/README.md 参照）。
 */
export type AuthAccount = {
    createdAt: Date
    id: number
    /**
     * "github" | "dev"
     */
    provider: string
    /**
     * プロバイダー側のユーザー ID
     */
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
