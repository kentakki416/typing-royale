import { test, expect } from "./fixtures"

/**
 * ホーム画面 (`/`) は feat/guest-play (Phase 7.5) でゲストにも公開された。
 * ゲスト・認証済みのどちらでも「Type real OSS code」ヒーローが表示される。
 */

test.describe("ホーム画面", () => {
  test("ゲストアクセスでもヒーローが表示される (リダイレクトなし)", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { name: /Type real/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /▶ プレイ開始/ })).toBeVisible()
  })

  test("認証済みでもヒーローが表示される", async ({ authedContext }) => {
    const page = await authedContext.newPage()
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { name: /Type real/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /▶ プレイ開始/ })).toBeVisible()
  })

  test("月間トップカードが TypeScript / JavaScript 並列で表示される", async ({ page }) => {
    await page.goto("/")
    /** API がエラーでもラベルは出るため、空状態でも表示される想定 */
    await expect(page.getByRole("heading", { name: /月間トップ/ })).toBeVisible()
    await expect(page.getByText("TypeScript").first()).toBeVisible()
    await expect(page.getByText("JavaScript").first()).toBeVisible()
  })
})
