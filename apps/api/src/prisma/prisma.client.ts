import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "./generated/client"

/**
 * DB_NAME 環境変数が設定されている場合、DATABASE_URL のDB名部分を置き換える
 * テスト実行時に DB_NAME=project-template_test を指定することで、テスト用DBに接続する
 */
const getConnectionString = (): string => {
  const baseUrl = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/project-template_dev"
  const dbName = process.env.DB_NAME
  if (!dbName) return baseUrl
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}

const adapter = new PrismaPg(getConnectionString())

export const prisma = new PrismaClient({ adapter })
