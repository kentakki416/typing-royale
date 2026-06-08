import type { Metadata } from "next"
import Link from "next/link"

import { startGithubOAuth, startGoogleOAuth } from "./actions"

export const metadata: Metadata = {
  title: "サインイン - Typing Royale",
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

/**
 * サインイン画面（mock: modal-login.html 準拠の単独ページ版）
 */
export default async function SignInPage({ searchParams }: Props) {
  const { error } = await searchParams
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "エラーが発生しました。" : null

  return (
    <main
      className="container container-narrow"
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        minHeight: "100vh",
        paddingTop: "32px",
      }}
    >
      <div className="card" style={{ maxWidth: "420px", padding: "32px", width: "100%" }}>
        <div className="text-center mb-24">
          <Link className="logo" href="/" style={{ fontSize: "20px" }}>
            <span className="accent">Typing</span> Royale
          </Link>
          <p className="text-muted text-sm mt-8">アカウントに接続して始めましょう</p>
        </div>

        {errorMessage && (
          <div
            className="card mb-16"
            style={{ borderColor: "var(--error)", color: "var(--error)", padding: "10px 14px" }}
          >
            {errorMessage}
          </div>
        )}

        <div className="flex" style={{ flexDirection: "column", gap: "12px" }}>
          <form action={startGithubOAuth}>
            <button className="btn btn-green btn-block" type="submit">
              <svg aria-hidden="true" fill="currentColor" style={{ height: "16px", width: "16px" }} viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.898-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub でサインイン
            </button>
          </form>

          <form action={startGoogleOAuth}>
            <button className="btn btn-block" type="submit">Google でサインイン</button>
          </form>
        </div>

        {!isProduction && (
          <div className="mt-24" style={{ borderTop: "1px dashed var(--border)", paddingTop: "16px" }}>
            <p className="text-center text-xs text-muted mb-8">
              Dev Login (NODE_ENV !== &quot;production&quot;)
            </p>
            <div className="flex gap-8">
              {DEV_LOGIN_USERS.map((user) => (
                <Link
                  className="btn"
                  href={`/dev/login?as=${user}`}
                  key={user}
                  style={{ flex: 1, justifyContent: "center" }}
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
