"use server"

import { randomBytes } from "node:crypto"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { OAUTH_STATE_COOKIE } from "@/libs/auth"

const isProduction = process.env.NODE_ENV === "production"

const STATE_COOKIE_MAX_AGE = 60 * 5

/**
 * OAuth state cookie の共通セット処理
 *
 * Google / GitHub 両方で同じ cookie 名・lifetime・属性を使う。
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
 * Google OAuth 認可フローの開始
 * state を Cookie に保存して CSRF 対策しつつ、Google 認可エンドポイントにリダイレクト
 */
export const startGoogleOAuth = async () => {
  const state = randomBytes(16).toString("hex")
  await setOAuthStateCookie(state)

  const params = new URLSearchParams({
    access_type: "offline",
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
  })
  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
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
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/github`,
    scope: "read:user",
    state,
  })
  redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
}
