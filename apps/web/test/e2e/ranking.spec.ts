import { test, expect } from "./fixtures"

/**
 * /ranking は公開ページ。言語タブ + テーブル (またはエンプティ表示) が出る
 */

test.describe("ランキング画面", () => {
  test("ランキングページが公開で開く + 言語タブが表示", async ({ page }) => {
    await page.goto("/ranking")
    await expect(page).toHaveURL(/\/ranking/)
    await expect(page.getByRole("heading", { name: /全期間ランキング/ })).toBeVisible()
    await expect(page.getByRole("link", { name: "TypeScript" })).toBeVisible()
    await expect(page.getByRole("link", { name: "JavaScript" })).toBeVisible()
  })
})
