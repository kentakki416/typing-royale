import { test, expect } from "./fixtures"

/**
 * ホーム画面 (`/`) はゲストアクセス時に sign-in にリダイレクトされる。
 * 認証済みでは「Type real OSS code」ヒーローが表示される
 */

test.describe("ホーム画面", () => {
  test("ゲストアクセスは /sign-in にリダイレクトされる", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test("認証済みではヒーローが表示される", async ({ authedContext }) => {
    const page = await authedContext.newPage()
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { name: /Type real/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /▶ プレイ開始/ })).toBeVisible()
  })
})
