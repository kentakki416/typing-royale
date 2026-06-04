import type { Metadata } from "next"
import Link from "next/link"

import { startGithubOAuth, startGoogleOAuth } from "./actions"

export const metadata: Metadata = {
  title: "サインイン",
}

const isProduction = process.env.NODE_ENV === "production"

/**
 * dev-login で使えるショートネーム
 * apps/api/src/prisma/seed.ts と apps/web/src/app/dev/login/route.ts と一致させる
 */
const DEV_LOGIN_USERS = ["alice", "bob"] as const

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "認証に失敗しました。もう一度お試しください。",
  invalid_request: "リクエストが不正です。",
  oauth_denied: "アカウントへのアクセスが拒否されました。",
  state_mismatch: "セッションが切れました。もう一度お試しください。",
}

type Props = {
  searchParams: Promise<{ error?: string }>
}

export default async function SignInPage({ searchParams }: Props) {
  const { error } = await searchParams
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "エラーが発生しました。" : null

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">サインイン</h1>
          <p className="text-sm text-gray-500">アカウントに接続して始めましょう</p>
        </div>

        {errorMessage && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="space-y-2">
          <form action={startGithubOAuth}>
            <button
              className="flex w-full items-center justify-center gap-2 rounded border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              type="submit"
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.898-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub でサインイン
            </button>
          </form>

          <form action={startGoogleOAuth}>
            <button
              className="w-full rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              type="submit"
            >
              Google でサインイン
            </button>
          </form>
        </div>

        {!isProduction && (
          <div className="space-y-2 border-t border-dashed border-gray-200 pt-4">
            <p className="text-center text-xs font-medium text-gray-500">
              Dev Login (NODE_ENV !== &quot;production&quot;)
            </p>
            <div className="flex gap-2">
              {DEV_LOGIN_USERS.map((user) => (
                <Link
                  className="flex-1 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900 hover:bg-amber-100"
                  href={`/dev/login?as=${user}`}
                  key={user}
                >
                  Login as {user}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
