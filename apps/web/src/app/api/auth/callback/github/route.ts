import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { authGithubResponseSchema } from "@repo/api-schema"

import { OAUTH_STATE_COOKIE, setAuthCookies } from "@/libs/auth"

const API_BASE_URL = process.env.API_URL || "http://localhost:8080"

/**
 * GitHub OAuth コールバックを受け取り、Express API で code を検証して
 * Access/Refresh Token を Cookie に保存した上でリダイレクトする。
 *
 * Google 用 callback と同型。差分は API パス（/api/auth/github）と redirect_uri のみ。
 */
export const GET = async (req: NextRequest) => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")

  if (errorParam) {
    return NextResponse.redirect(new URL("/sign-in?error=oauth_denied", req.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_request", req.url))
  }

  const store = await cookies()
  const expected = store.get(OAUTH_STATE_COOKIE)?.value
  store.delete(OAUTH_STATE_COOKIE)

  if (!expected || expected !== state) {
    return NextResponse.redirect(new URL("/sign-in?error=state_mismatch", req.url))
  }

  const apiRes = await fetch(`${API_BASE_URL}/api/auth/github`, {
    body: JSON.stringify({
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/github`,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  if (!apiRes.ok) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_failed", req.url))
  }

  const json = authGithubResponseSchema.parse(await apiRes.json())
  await setAuthCookies(json.access_token, json.refresh_token)

  /**
   * 初回ログインの場合は onboarding、それ以外はホームへ。
   * /onboarding 自体は PR 5 で実装するため、本 PR 時点ではホームへ着地する形となる。
   */
  const dest = json.is_new_user ? "/onboarding" : "/"
  return NextResponse.redirect(new URL(dest, req.url))
}
