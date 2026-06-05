/* eslint-disable no-console */
import { createPrismaClient } from "../src/client"

const prisma = createPrismaClient()

/**
 * dev-login で使う開発用ユーザー
 *
 * `/api/auth/dev-login` および web の sign-in 画面の「Login as alice/bob」
 * ボタン経由でログインできる。production 環境では seed 自体スキップする。
 */
type DevUserSeed = {
  displayName: string
  email: string
}

const devUsers: DevUserSeed[] = [
  { displayName: "Alice (dev)", email: "alice@dev.local" },
  { displayName: "Bob (dev)", email: "bob@dev.local" },
]

const seedDevUsers = async () => {
  for (const devUser of devUsers) {
    const user = await prisma.user.upsert({
      create: { displayName: devUser.displayName, email: devUser.email },
      update: { displayName: devUser.displayName },
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

/**
 * 問題プールが扱う言語マスタ
 *
 * `apps/cron` のクローラが `slug` を Search API の `language:` フィルタに
 * 渡して repo を絞り込むため、production でも本データは必要。
 * production 含めて全環境で upsert する（冪等なので何度実行しても安全）。
 */
type LanguageSeed = {
  name: string
  slug: string
}

const languages: LanguageSeed[] = [
  { name: "TypeScript", slug: "typescript" },
  { name: "JavaScript", slug: "javascript" },
]

const seedLanguages = async () => {
  for (const lang of languages) {
    await prisma.language.upsert({
      create: { name: lang.name, slug: lang.slug },
      update: { name: lang.name },
      where: { slug: lang.slug },
    })
    console.log(`Seeded language: ${lang.slug}`)
  }
}

const main = async () => {
  /**
   * languages は production でも投入する（クローラの動作に必要なマスタ）。
   * dev users は production ではスキップ。
   */
  await seedLanguages()
  if (process.env.NODE_ENV === "production") {
    console.log("Skip dev users seeding: NODE_ENV=production")
    return
  }
  await seedDevUsers()
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
