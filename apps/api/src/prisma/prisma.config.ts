import { defineConfig, env } from "prisma/config"

/**
 * DB_NAME 環境変数が設定されている場合、DATABASE_URL のDB名部分を置き換える
 * テスト実行時に DB_NAME=project-template_test を指定することで、
 * テスト用DBにマイグレーションを適用できる
 */
const getDatasourceUrl = (): string => {
  const baseUrl = env("DATABASE_URL")
  const dbName = process.env.DB_NAME
  if (!dbName) return baseUrl
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}

export default defineConfig({
  datasource: {
    url: getDatasourceUrl(),
  },
  migrations: {
    path: "./migrations",
    seed: "npx tsx ./src/prisma/seed.ts"
  },
  schema: "./schema.prisma",
})
