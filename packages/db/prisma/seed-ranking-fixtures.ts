/* eslint-disable no-console */
import type { PrismaClient } from "../generated/client"

/**
 * 開発時の動作確認用に、殿堂入りと月間ランキングを埋めるためのダミーユーザー +
 * ベスト / 月間 snapshot を投入する。
 *
 * 投入する内容:
 * - dummy user 10 人 (charlie..liam) を upsert
 * - 各 user に PlaySession (fixture repo / fixture problem) を 1 件持たせ、
 *   user_language_best (= 殿堂入りの基) を score 20..1500 で埋める
 * - 各 user の当月 monthly_ranking_snapshots を score 15..1400 で埋める
 * - 加えて先月分の monthly_ranking_snapshots を 3 件 (nat / olive / pat) 投入し、
 *   月間ランキング UI が当月でフィルタされていることを目視で確認できるようにする
 *
 * 設計意図:
 * - 最下位を 15 (月間) / 20 (殿堂入り) と低く設定することで、ログインユーザー
 *   (alice 等) が短時間プレイで boundary を超えてランクインしポップアップ表示を
 *   確認できるようにする
 * - すべて upsert / findFirst→update→create で実装、何度 seed しても重複しない
 *
 * production 環境では呼ばない (apps/db/prisma/seed.ts の main 側で NODE_ENV ガード)
 */

const FIXTURE_REPO_GITHUB_ID = BigInt(999_999_999)
const FIXTURE_PROBLEM_AST_HASH = "fixture-ranking-seed-ast-v1"

type FixtureUser = {
  email: string
  displayName: string
  favoriteRepoUrl?: string
  lifetimeBest: number
  monthlyCurrent: number
}

const fixtureUsers: FixtureUser[] = [
  { displayName: "Charlie (dev)", email: "charlie@dev.local", favoriteRepoUrl: "https://github.com/microsoft/TypeScript", lifetimeBest: 1500, monthlyCurrent: 1400 },
  { displayName: "Dave (dev)", email: "dave@dev.local", favoriteRepoUrl: "https://github.com/facebook/react", lifetimeBest: 1200, monthlyCurrent: 1100 },
  { displayName: "Eve (dev)", email: "eve@dev.local", favoriteRepoUrl: "https://github.com/vercel/next.js", lifetimeBest: 1000, monthlyCurrent: 900 },
  { displayName: "Frank (dev)", email: "frank@dev.local", favoriteRepoUrl: "https://github.com/nodejs/node", lifetimeBest: 800, monthlyCurrent: 700 },
  { displayName: "Grace (dev)", email: "grace@dev.local", lifetimeBest: 600, monthlyCurrent: 500 },
  { displayName: "Henry (dev)", email: "henry@dev.local", lifetimeBest: 400, monthlyCurrent: 300 },
  { displayName: "Ivy (dev)", email: "ivy@dev.local", lifetimeBest: 200, monthlyCurrent: 150 },
  { displayName: "Jack (dev)", email: "jack@dev.local", lifetimeBest: 100, monthlyCurrent: 80 },
  { displayName: "Kate (dev)", email: "kate@dev.local", lifetimeBest: 50, monthlyCurrent: 40 },
  { displayName: "Liam (dev)", email: "liam@dev.local", lifetimeBest: 20, monthlyCurrent: 15 },
]

type LastMonthFixtureUser = {
  email: string
  displayName: string
  monthlyLast: number
}

const lastMonthFixtureUsers: LastMonthFixtureUser[] = [
  { displayName: "Nat (last month)", email: "nat@dev.local", monthlyLast: 2000 },
  { displayName: "Olive (last month)", email: "olive@dev.local", monthlyLast: 1800 },
  { displayName: "Pat (last month)", email: "pat@dev.local", monthlyLast: 1700 },
]

const formatYearMonthJst = (date: Date): string => {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}`
}

const addMonths = (date: Date, n: number): Date => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

export const seedRankingFixtures = async (prisma: PrismaClient): Promise<void> => {
  const language = await prisma.language.findUnique({ where: { slug: "typescript" } })
  if (language === null) {
    console.log("Skip ranking fixtures: 'typescript' language not seeded yet")
    return
  }

  /**
   * fixture 用 CrawledRepo (PlaySession.crawledRepoId が必須なため)
   */
  const crawledRepo = await prisma.crawledRepo.upsert({
    create: {
      candidatesCount: 1,
      commitSha: "0000000000000000000000000000000000000000",
      crawledAt: new Date(),
      defaultBranch: "main",
      description: "Fixture repo for ranking dummy data (dev only).",
      fullName: "dev/fixture-ranking-repo",
      githubId: FIXTURE_REPO_GITHUB_ID,
      languageId: language.id,
      license: "MIT",
      name: "fixture-ranking-repo",
      owner: "dev",
      stars: 0,
      storedCount: 1,
      topics: [],
    },
    update: {},
    where: { githubId: FIXTURE_REPO_GITHUB_ID },
  })

  /**
   * fixture 用 Problem (PlaySession ↔ Problem の FK 整合のため最低 1 件必要)
   */
  await prisma.problem.upsert({
    create: {
      astHash: FIXTURE_PROBLEM_AST_HASH,
      charCount: 10,
      codeBlock: "return 0",
      crawledRepoId: crawledRepo.id,
      functionName: "fixture",
      languageId: language.id,
      lineCount: 1,
      sourceFilePath: "src/fixture.ts",
      sourceLineEnd: 1,
      sourceLineStart: 1,
      sourceUrl: "https://github.com/dev/fixture-ranking-repo/blob/main/src/fixture.ts",
    },
    update: {},
    where: {
      languageId_astHash: { astHash: FIXTURE_PROBLEM_AST_HASH, languageId: language.id },
    },
  })

  const now = new Date()
  const currentYearMonth = formatYearMonthJst(now)
  const lastYearMonth = formatYearMonthJst(addMonths(now, -1))
  /** 先月の真ん中あたりの日付 (yearMonth カラムが真の判定軸だが playedAt も整合させる) */
  const lastMonthPlayedAt = addMonths(now, -1)

  /** 当月分の dummy users */
  for (const f of fixtureUsers) {
    const user = await prisma.user.upsert({
      create: {
        canPublicRanking: true,
        displayName: f.displayName,
        email: f.email,
        favoriteRepoUrl: f.favoriteRepoUrl ?? null,
      },
      update: {
        displayName: f.displayName,
        favoriteRepoUrl: f.favoriteRepoUrl ?? null,
      },
      where: { email: f.email },
    })

    await prisma.authAccount.upsert({
      create: { provider: "dev", providerAccountId: f.email, userId: user.id },
      update: {},
      where: {
        provider_providerAccountId: { provider: "dev", providerAccountId: f.email },
      },
    })

    /**
     * PlaySession は自然 unique key が無いので findFirst で既存 fixture セッション
     * を探して更新、無ければ新規作成する形で冪等化する
     */
    const existingSession = await prisma.playSession.findFirst({
      orderBy: { id: "asc" },
      where: { crawledRepoId: crawledRepo.id, mode: "solo", userId: user.id },
    })

    const sessionData = {
      accuracy: 0.95,
      crawledRepoId: crawledRepo.id,
      languageId: language.id,
      mistypeStats: {},
      mode: "solo",
      playedAt: now,
      problemsCompleted: 1,
      problemsPlayed: 1,
      score: f.lifetimeBest,
      typedChars: f.lifetimeBest,
      userId: user.id,
    }

    const session = existingSession === null
      ? await prisma.playSession.create({ data: sessionData })
      : await prisma.playSession.update({ data: sessionData, where: { id: existingSession.id } })

    await prisma.userLanguageBest.upsert({
      create: {
        accuracy: 0.95,
        bestPlaySessionId: session.id,
        languageId: language.id,
        playedAt: now,
        score: f.lifetimeBest,
        typedChars: f.lifetimeBest,
        userId: user.id,
      },
      update: {
        accuracy: 0.95,
        bestPlaySessionId: session.id,
        playedAt: now,
        score: f.lifetimeBest,
        typedChars: f.lifetimeBest,
      },
      where: {
        userId_languageId: { languageId: language.id, userId: user.id },
      },
    })

    await prisma.monthlyRankingSnapshot.upsert({
      create: {
        accuracy: 0.95,
        languageId: language.id,
        playedAt: now,
        score: f.monthlyCurrent,
        userId: user.id,
        yearMonth: currentYearMonth,
      },
      update: {
        accuracy: 0.95,
        playedAt: now,
        score: f.monthlyCurrent,
      },
      where: {
        yearMonth_languageId_userId: {
          languageId: language.id,
          userId: user.id,
          yearMonth: currentYearMonth,
        },
      },
    })

    console.log(`Seeded ranking fixture: ${f.email} (lifetime=${f.lifetimeBest}, monthly=${f.monthlyCurrent})`)
  }

  /** 先月だけ snapshot を持つ users (当月ランキングには出ない) */
  for (const f of lastMonthFixtureUsers) {
    const user = await prisma.user.upsert({
      create: { canPublicRanking: true, displayName: f.displayName, email: f.email },
      update: { displayName: f.displayName },
      where: { email: f.email },
    })

    await prisma.authAccount.upsert({
      create: { provider: "dev", providerAccountId: f.email, userId: user.id },
      update: {},
      where: {
        provider_providerAccountId: { provider: "dev", providerAccountId: f.email },
      },
    })

    await prisma.monthlyRankingSnapshot.upsert({
      create: {
        accuracy: 0.95,
        languageId: language.id,
        playedAt: lastMonthPlayedAt,
        score: f.monthlyLast,
        userId: user.id,
        yearMonth: lastYearMonth,
      },
      update: {
        accuracy: 0.95,
        playedAt: lastMonthPlayedAt,
        score: f.monthlyLast,
      },
      where: {
        yearMonth_languageId_userId: {
          languageId: language.id,
          userId: user.id,
          yearMonth: lastYearMonth,
        },
      },
    })

    console.log(`Seeded last-month fixture: ${f.email} (yearMonth=${lastYearMonth}, score=${f.monthlyLast})`)
  }

  console.log(`Ranking fixtures seeded (current=${currentYearMonth}, last=${lastYearMonth})`)
}
