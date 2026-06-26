/* eslint-disable no-console */
import { createPrismaClient } from "../src/client"

import { seedRankingFixtures } from "./seed-ranking-fixtures"

const prisma = createPrismaClient()

/**
 * dev-login で使う開発用ユーザー
 *
 * `/api/auth/dev-login` および web の sign-in 画面の「Login as alice/bob」
 * ボタン経由でログインできる。production 環境では seed 自体スキップする。
 */
type DevUserSeed = {
  githubUsername: string
  email: string
}

const devUsers: DevUserSeed[] = [
  { githubUsername: "alice", email: "alice@dev.local" },
  { githubUsername: "bob", email: "bob@dev.local" },
]

const seedDevUsers = async () => {
  for (const devUser of devUsers) {
    const user = await prisma.user.upsert({
      create: { githubUsername: devUser.githubUsername, email: devUser.email },
      update: { githubUsername: devUser.githubUsername },
      where: { email: devUser.email },
    })

    /**
     * AuthAccount(provider: "dev") を upsert して
     * Google アカウントと衝突しない形で dev ユーザーを識別できるようにする
     */
    await prisma.authAccount.upsert({
      create: {
        provider: "dev",
        providerAccountId: devUser.email,
        userId: user.id,
      },
      update: {},
      where: {
        provider_providerAccountId: {
          provider: "dev",
          providerAccountId: devUser.email,
        },
      },
    })
    console.log(`Seeded dev user: ${devUser.email} (id=${user.id})`)
  }
}

const main = async () => {
  /**
   * 言語マスタなどの本番マスタデータは migration
   * (例: 20260626120000_seed_master_languages) で管理する。migrate deploy に乗せて
   * 自動・冪等・バージョン管理できるため、seed スクリプトでは扱わない。
   * seed は dev 専用データ（dev users / ランキング fixtures）だけを担当し、
   * production では何もしない。
   */
  if (process.env.NODE_ENV === "production") {
    console.log("Skip seeding: NODE_ENV=production (master data is managed by migrations)")
    return
  }
  await seedDevUsers()
  await seedRankingFixtures(prisma)
  console.log("Seed completed (PostgreSQL)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
