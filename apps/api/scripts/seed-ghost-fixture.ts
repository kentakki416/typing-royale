/* eslint-disable no-console */
import { gzipSync } from "node:zlib"

import { createPrismaClient } from "@repo/db"

const prisma = createPrismaClient()

/**
 * dev 環境で「神々に挑戦」モードを動作確認するための fixture 投入スクリプト
 *
 * - Bob (user_id=2) の play_session 2 に play_session_problems × 20 を紐付け
 * - 同 session に keystroke_logs を 1 件追加（自分が常に勝つよう短めのログ）
 *
 * これにより Alice (user_id=1) でログインしたユーザーが /play から
 * 「神々に挑戦」をクリックすると、Bob が神として選定されゴースト併走 UI に
 * 着地する
 */
const main = async () => {
  const ghostSessionId = 2

  const existing = await prisma.playSessionProblem.count({
    where: { playSessionId: ghostSessionId },
  })
  if (existing > 0) {
    await prisma.playSessionProblem.deleteMany({
      where: { playSessionId: ghostSessionId },
    })
  }

  const problems = await prisma.problem.findMany({
    orderBy: { id: "asc" },
    take: 20,
    where: { languageId: 1 },
  })
  if (problems.length < 20) {
    throw new Error(`problems for languageId=1 が ${problems.length} 件しかない（20 必要）`)
  }

  await prisma.playSessionProblem.createMany({
    data: problems.map((p, i) => ({
      charsTyped: i < 6 ? p.charCount : 0,
      completed: i < 6,
      orderIndex: i,
      playSessionId: ghostSessionId,
      problemId: p.id,
    })),
  })
  console.log(`Created 20 play_session_problems for session ${ghostSessionId}`)

  /**
   * keystroke log: 90 秒で 270 キー（3 キー/秒）を仮想的に打鍵
   * 神は問題 0〜5 を完走（6 問完了）、問題 6 を途中で時間切れ
   */
  const log: Array<{ elapsedMs: number; inputChar: string; isCorrect: boolean; problemIndex: number }> = []
  let elapsedMs = 1000
  let problemIndex = 0
  let charsInCurrent = 0
  while (elapsedMs < 110_000 && problemIndex < problems.length) {
    log.push({
      elapsedMs,
      inputChar: "a",
      isCorrect: true,
      problemIndex,
    })
    charsInCurrent += 1
    elapsedMs += 333
    if (charsInCurrent >= problems[problemIndex].charCount) {
      problemIndex += 1
      charsInCurrent = 0
    }
  }
  console.log(`Generated ${log.length} keystroke entries across ${problemIndex} completed problems`)

  const compressed = gzipSync(Buffer.from(JSON.stringify(log)))

  await prisma.keystrokeLog.upsert({
    create: { compressedLog: compressed, playSessionId: ghostSessionId },
    update: { compressedLog: compressed },
    where: { playSessionId: ghostSessionId },
  })
  console.log(`Upserted keystroke_logs for session ${ghostSessionId} (${compressed.length} bytes gzipped)`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    return prisma.$disconnect().finally(() => process.exit(1))
  })
