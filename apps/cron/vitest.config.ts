import { defineConfig } from "vitest/config"

/**
 * apps/cron 用 Vitest 設定
 *
 * Phase 2 で追加する AST モジュールや GitHub クライアントは外部依存を mock するため、
 * apps/api のように DB を共有する制約はない。並列実行（デフォルト）で問題ない。
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
  },
})
