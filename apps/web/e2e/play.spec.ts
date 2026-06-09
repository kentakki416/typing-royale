import { test, expect } from "./fixtures"

/**
 * /play で言語選択 → TypeScript の「通常プレイ」ボタンで /play/[sessionId] に遷移
 * play 画面の背景 (.play-backdrop) と HUD が出ることを確認
 */

test.describe("プレイ画面遷移", () => {
  test("言語選択 → 通常プレイで /play/[id] に遷移し HUD が出る", async ({ authedContext }) => {
    const page = await authedContext.newPage()
    await page.goto("/play")
    await expect(page).toHaveURL(/\/play$/)

    /** 最初の「▶ 通常プレイ」(TypeScript) を押す */
    const startButtons = page.getByRole("button", { name: /通常プレイ/ })
    await expect(startButtons.first()).toBeVisible()
    await startButtons.first().click()

    /** /play/<uuid> に遷移 */
    await expect(page).toHaveURL(/\/play\/[0-9a-f-]{8,}/)

    /** Splash → playing への遷移を 6 秒待つ。play-backdrop が出れば playing 到達 */
    await expect(page.locator(".play-backdrop")).toBeVisible({ timeout: 6_000 })
    await expect(page.locator(".play-backdrop")).toHaveClass(/tier-1/)
  })
})
