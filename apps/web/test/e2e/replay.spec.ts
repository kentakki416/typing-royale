import { test, expect } from "./fixtures"

/**
 * /replay/[playSessionId] は公開ページ。
 * dev seed では play_session が無い可能性があるので、
 * 404 のときは not-found 表示、ある場合は HUD / コードブロックが見える
 */

test.describe("リプレイ画面", () => {
  test("ranking から「視聴」リンクがあれば /replay/[id] に遷移", async ({ page }) => {
    await page.goto("/ranking")
    const watchLinks = page.locator("a", { hasText: /視聴/ })
    if (!(await watchLinks.first().isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip(true, "No ranking entries to open replay")
      return
    }
    await watchLinks.first().click()
    await expect(page).toHaveURL(/\/replay\/\d+/)
    /** HUD（経過時間 / 累計文字数 / 正確率 / 現在の問題）が出る */
    await expect(page.getByText("経過時間")).toBeVisible({ timeout: 4_000 })
    await expect(page.locator(".replay-controls")).toBeVisible()
  })

  test("存在しない playSessionId は not-found 表示", async ({ page }) => {
    await page.goto("/replay/99999999")
    await expect(page.getByRole("heading", { name: /リプレイが見つかりません/ })).toBeVisible()
  })
})
