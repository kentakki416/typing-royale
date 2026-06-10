import { defineConfig, devices } from "@playwright/test"

/**
 * apps/web の E2E 設定
 *
 * - dev サーバー (port 3000) と API サーバー (port 8080) は事前に起動済みである必要がある
 *   ローカル: `pnpm dev` で両方起動
 *   CI: docker compose + `pnpm dev` をバックグラウンドで起動して wait-on で待つ
 *
 * - 認証は dev-login 経由で /api/auth/dev-login にトークンを取得し、cookie に注入する
 *   ($BASE_URL 配下の /api/auth/dev-login は production 以外で有効)
 */
export default defineConfig({
  testDir: "./test/e2e",
  /** タイムアウト */
  timeout: 30_000,
  expect: { timeout: 5_000 },
  /** CI では並列度を下げ flake を減らす */
  fullyParallel: !process.env.CI,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  outputDir: "./e2e-results",
})
