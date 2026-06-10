import { test, expect } from "./fixtures"

/**
 * /play で言語選択画面が出ること、「通常プレイ」ボタンが visible / enabled で
 * あることを確認する smoke テスト。
 *
 * CI の dev DB には problems が入っていないため、ボタンを実際に押して
 * /play/[sessionId] に遷移するところはテストしない（500 になる）。
 * problems の seed 拡充後にフル journey を追加する想定
 */

test.describe("プレイ画面遷移", () => {
  test("/play で言語選択画面が表示され通常プレイボタンが見える", async ({ authedContext }) => {
    const page = await authedContext.newPage()
    await page.goto("/play")
    await expect(page).toHaveURL(/\/play$/)

    /** 「▶ 通常プレイ」ボタンが少なくとも 1 つ visible */
    const startButtons = page.getByRole("button", { name: /通常プレイ/ })
    await expect(startButtons.first()).toBeVisible()

    /** TypeScript / JavaScript の言語カードが両方ある */
    await expect(page.getByText("TypeScript")).toBeVisible()
    await expect(page.getByText("JavaScript")).toBeVisible()
  })
})
