"use server"

import { randomBytes } from "node:crypto"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { env } from "@/env"
import { OAUTH_STATE_COOKIE } from "@/libs/auth"

const isProduction = env.NODE_ENV === "production"

const STATE_COOKIE_MAX_AGE = 60 * 5

/**
 * OAuth state cookie の共通セット処理
 *
 * 詳細な選択理由は libs/auth.ts の setAuthCookies コメント参照。
 */
const setOAuthStateCookie = async (state: string): Promise<void> => {
  const store = await cookies()
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: STATE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  })
}

/**
 * GitHub OAuth 認可フローの開始
 *
 * state を Cookie に保存して CSRF 対策しつつ、GitHub 認可エンドポイントへリダイレクト。
 * 要求スコープは `read:user` のみ（spec: github-auth/README.md「OAuth スコープ」）。
 */
export const startGithubOAuth = async () => {
  const state = randomBytes(16).toString("hex")
  await setOAuthStateCookie(state)

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback/github`,
    scope: "read:user",
    state,
  })
  redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
}
