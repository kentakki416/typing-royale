import { test, expect } from "./fixtures"

/**
 * /hall-of-fame は公開ページ。エントリがあれば上位 3 名 hof-card、
 * 無ければ「まだエントリがありません」のエンプティ
 */

test.describe("殿堂入り", () => {
  test("殿堂入りページが開いて言語タブが表示", async ({ page }) => {
    await page.goto("/hall-of-fame")
    await expect(page).toHaveURL(/\/hall-of-fame/)
    await expect(page.getByRole("heading", { name: /殿堂入り/ })).toBeVisible()
    await expect(page.getByRole("link", { name: "TypeScript" })).toBeVisible()
  })

  test("上位 3 名カードがあればクリックで神モーダルが開く", async ({ page }) => {
    await page.goto("/hall-of-fame")
    const firstCard = page.locator(".hof-card.has-crown.tappable").first()
    /** dev DB に entry が無い場合はテストをスキップ */
    if (!(await firstCard.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip(true, "No HoF entries in dev DB")
      return
    }
    await firstCard.click()
    await expect(page.locator(".god-modal")).toBeVisible({ timeout: 3_000 })
    await expect(page.locator(".curtain-stage.active")).toBeVisible()
  })
})
