import { test as base, type BrowserContext } from "@playwright/test"

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080"

const ACCESS_TOKEN_COOKIE = "app_access_token"
const REFRESH_TOKEN_COOKIE = "app_refresh_token"

type AuthFixtures = {
  /**
   * dev-login 経由で Alice (seed 済み dev user) のトークンを取得し、
   * context の cookie に注入した状態のページコンテキストを返す
   */
  authedContext: BrowserContext
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const baseHost = new URL(baseURL).hostname

/**
 * 指定 email の dev-login を叩き、cookies を context に注入する
 */
const loginAs = async (context: BrowserContext, email: string): Promise<void> => {
  const res = await context.request.post(`${API_URL}/api/auth/dev-login`, {
    data: { email },
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok()) {
    throw new Error(`dev-login failed for ${email}: ${res.status()} ${await res.text()}`)
  }
  const body = (await res.json()) as { access_token: string; refresh_token: string }
  await context.addCookies([
    {
      domain: baseHost,
      httpOnly: false,
      name: ACCESS_TOKEN_COOKIE,
      path: "/",
      sameSite: "Lax",
      secure: false,
      value: body.access_token,
    },
    {
      domain: baseHost,
      httpOnly: false,
      name: REFRESH_TOKEN_COOKIE,
      path: "/",
      sameSite: "Lax",
      secure: false,
      value: body.refresh_token,
    },
  ])
}

export const test = base.extend<AuthFixtures>({
  // eslint-disable-next-line no-empty-pattern
  authedContext: async ({ browser }, use) => {
    const context = await browser.newContext()
    await loginAs(context, "alice@dev.local")
    await use(context)
    await context.close()
  },
})

export { expect } from "@playwright/test"
