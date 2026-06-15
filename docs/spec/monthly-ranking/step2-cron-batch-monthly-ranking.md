# step2: cron — batch:monthly-ranking バッチ

毎時 0 分に動き、当月分の `monthly_ranking_snapshots` を更新する task。`apps/cron` の規約に従って 1 ファイル = 1 task で作る。

## 対応内容

### `apps/cron/package.json` の scripts に追加

```json
"batch:monthly-ranking": "dotenvx run -f .env.local -- tsx src/task/monthly-ranking-batch.ts"
```

### `apps/cron/src/task/monthly-ranking-batch.ts`

apps/cron の規約に従い、env 組み立て + Prisma client 生成 + service 呼び出しだけの薄い 1 ファイル：

```ts
import { createPrismaClient } from "@repo/db"
import { logger } from "@repo/logger"

import { env } from "../env"
import { PrismaMonthlyRankingSnapshotRepository } from "../repository/prisma"
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import { MonthlyRankingAggregator } from "../service/monthly-ranking/aggregator"

const main = async () => {
  const prisma = createPrismaClient({ url: env.DATABASE_URL })
  setupGracefulShutdown(prisma)

  const repository = new PrismaMonthlyRankingSnapshotRepository(prisma)
  const aggregator = new MonthlyRankingAggregator(repository)

  const result = await aggregator.run()
  logger.info("batch:monthly-ranking finished", {
    languagesProcessed: result.languagesProcessed,
    rowsUpserted: result.rowsUpserted,
    yearMonth: result.yearMonth,
  })
}

main().catch((err) => {
  logger.error("batch:monthly-ranking failed", err instanceof Error ? err : new Error(String(err)))
  process.exit(1)
})
```

### `apps/cron/src/service/monthly-ranking/aggregator.ts`

業務ロジックの本体。集計 SQL を呼ぶ + UPSERT を repository に委譲：

```ts
import { logger } from "@repo/logger"

import type { MonthlyRankingSnapshotRepository } from "../../repository/prisma"

export class MonthlyRankingAggregator {
  constructor(private readonly repo: MonthlyRankingSnapshotRepository) {}

  run = async (): Promise<{ languagesProcessed: number; rowsUpserted: number; yearMonth: string }> => {
    /** JST の当月 (YYYY-MM) と境界を計算 */
    const { yearMonth, monthStartJst, monthEndJst } = currentMonthJst(new Date())
    logger.info("MonthlyRankingAggregator: start", { monthEndJst, monthStartJst, yearMonth })

    const rows = await this.repo.aggregateCurrentMonth({
      monthEndJst,
      monthStartJst,
      yearMonth,
    })

    await this.repo.upsertMany(rows)

    const languagesProcessed = new Set(rows.map((r) => r.languageId)).size
    return { languagesProcessed, rowsUpserted: rows.length, yearMonth }
  }
}

/**
 * JST の暦月の始点・終点を計算する純関数（lib に切り出してもよい）
 * 戻り値の month_start_jst / month_end_jst は JST のローカルタイム文字列で、
 * SQL 側で AT TIME ZONE 'Asia/Tokyo' で UTC に変換して比較する。
 */
const currentMonthJst = (now: Date): { monthEndJst: string; monthStartJst: string; yearMonth: string } => {
  /** 「now を JST に変換した時刻」の YYYY-MM-DD HH:mm:ss を得る */
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]))
  const yearNum = Number(parts.year)
  const monthNum = Number(parts.month)
  const yearMonth = `${parts.year}-${parts.month}`
  const monthStartJst = `${yearMonth}-01 00:00:00`
  const next = monthNum === 12 ? `${yearNum + 1}-01-01 00:00:00` : `${yearNum}-${String(monthNum + 1).padStart(2, "0")}-01 00:00:00`
  return { monthEndJst: next, monthStartJst, yearMonth }
}
```

### `apps/cron/src/repository/prisma/monthly-ranking-snapshot-repository.ts`

```ts
import { PrismaClient } from "@repo/db"

export type AggregateInput = {
  monthEndJst: string
  monthStartJst: string
  yearMonth: string
}

export type MonthlyRankingRow = {
  accuracy: number
  languageId: number
  playedAt: Date
  rank: number
  score: number
  userId: number
  yearMonth: string
}

export interface MonthlyRankingSnapshotRepository {
  /**
   * 当月の play_sessions を集計し、各言語ごとに tie-breaking 適用後の上位 10 位までを返す。
   * 11 位以下は monthly_ranking_snapshots に保存する動機がない（ホーム画面の表示は最大 5、
   * API の limit 上限は 10 でそれ以上は使われない）ため、本リポジトリで切り捨てる
   */
  aggregateCurrentMonth: (input: AggregateInput) => Promise<MonthlyRankingRow[]>
  /**
   * 上位 10 位の rows を UPSERT し、当月分のうち今回の result に含まれていない user_id × language_id
   * の行を DELETE する（順位入れ替わりに追従するため）
   */
  upsertMany: (rows: MonthlyRankingRow[]) => Promise<void>
}

export class PrismaMonthlyRankingSnapshotRepository implements MonthlyRankingSnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  aggregateCurrentMonth = async (input: AggregateInput): Promise<MonthlyRankingRow[]> => {
    /**
     * 当月の play_sessions から (language_id, user_id) ごとの max(score) を取り、
     * tie-breaking 適用後の rank 付き上位 10 位までを返す。月境界は JST で判断する。
     * 上位 10 位限定の理由は docs/spec/monthly-ranking/README.md「保存対象は各 (年月, 言語) ごとの上位 10 位まで」を参照
     */
    return this.prisma.$queryRaw<MonthlyRankingRow[]>`
      WITH user_best AS (
        SELECT DISTINCT ON (ps.user_id, ps.language_id)
          ps.user_id      AS "userId",
          ps.language_id  AS "languageId",
          ps.score,
          ps.accuracy,
          ps.played_at    AS "playedAt"
        FROM play_sessions ps
        JOIN users u ON u.id = ps.user_id
        WHERE
          ps.played_at >= (${input.monthStartJst}::timestamp AT TIME ZONE 'Asia/Tokyo')
          AND ps.played_at < (${input.monthEndJst}::timestamp AT TIME ZONE 'Asia/Tokyo')
          AND u.can_public_ranking = TRUE
        ORDER BY ps.user_id, ps.language_id,
                 ps.score DESC, ps.accuracy DESC, ps.played_at ASC
      ),
      ranked AS (
        SELECT
          "userId",
          "languageId",
          score,
          accuracy,
          "playedAt",
          RANK() OVER (
            PARTITION BY "languageId"
            ORDER BY score DESC, accuracy DESC, "playedAt" ASC
          )::int AS rank
        FROM user_best
      )
      SELECT
        ${input.yearMonth} AS "yearMonth",
        "languageId",
        "userId",
        score,
        accuracy,
        "playedAt",
        rank
      FROM ranked
      WHERE rank <= 10            -- ★ 各 (年月, 言語) ごとに上位 10 位まで
      ORDER BY "languageId", rank
    `
  }

  upsertMany = async (rows: MonthlyRankingRow[]): Promise<void> => {
    if (rows.length === 0) return
    /**
     * createMany では ON CONFLICT が使えないので transaction で個別 upsert。
     * 月内のユーザー数は数千レベルを想定、1 transaction で十分間に合う
     */
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.monthlyRankingSnapshot.upsert({
          create: {
            accuracy: r.accuracy,
            languageId: r.languageId,
            playedAt: r.playedAt,
            rank: r.rank,
            score: r.score,
            userId: r.userId,
            yearMonth: r.yearMonth,
          },
          update: {
            accuracy: r.accuracy,
            playedAt: r.playedAt,
            rank: r.rank,
            score: r.score,
            snapshotAt: new Date(),
          },
          where: {
            yearMonth_languageId_userId: {
              languageId: r.languageId,
              userId: r.userId,
              yearMonth: r.yearMonth,
            },
          },
        })
      )
    )
  }
}
```

### `apps/cron/CLAUDE.md` と `README.md` への追記

「含まれるタスク」テーブルに 1 行追加：

| コマンド | スケジュール | 用途 |
| --- | --- | --- |
| `pnpm batch:monthly-ranking` | 毎時 0 分 | 月間ランキング snapshot 更新 |

### スケジュール設定（インフラ側、後続 PR で対応）

- 本 PR ではコード追加のみ
- ECS Scheduled Task の cron 設定（`0 * * * *`）は terraform 側で別途追加
- ローカル動作確認は `pnpm --filter cron batch:monthly-ranking` を手動実行

## 動作確認

```bash
# 1. ローカルで DB に試しのプレイデータがある状態で
docker exec typing-royale-postgres psql -U postgres -d typing_royale_dev \
  -c "INSERT INTO play_sessions (user_id, language_id, mode, crawled_repo_id, typed_chars, accuracy, score, problems_played, problems_completed, mistype_stats, played_at, updated_at) VALUES (1, 1, 'solo', 1, 300, 0.95, 285, 10, 10, '{}', NOW(), NOW());"

# 2. バッチを 1 回実行
cd apps/cron && pnpm batch:monthly-ranking

# 3. スナップショットが書かれていることを確認
docker exec typing-royale-postgres psql -U postgres -d typing_royale_dev \
  -c "SELECT year_month, language_id, user_id, rank, score, accuracy FROM monthly_ranking_snapshots ORDER BY language_id, rank;"
```

期待値：

- 各言語ごとに当月のベストスコアでランクが付いている
- `rank=1` のスコアが他より高い（or 同点なら accuracy が高い、or playedAt が早い）
- 過月のテストデータを入れて再実行しても、当月分しかスナップショットに反映されない
- 公開設定 `can_public_ranking=false` のユーザーは含まれない
