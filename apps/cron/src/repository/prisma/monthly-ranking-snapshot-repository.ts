import type { PrismaClient } from "@repo/db"

/**
 * `monthly_ranking_snapshots` テーブルの Repository（apps/cron 用、書き込み中心）。
 *
 * 毎時 cron の batch:monthly-ranking が当月の集計結果を UPSERT し、API は SELECT で
 * 読むだけ。詳細仕様は docs/spec/monthly-ranking/README.md を参照。
 */

/**
 * aggregateCurrentMonth の入力。バッチが起動時刻から JST 暦月の境界を計算して渡す
 */
export type AggregateInput = {
  /** "YYYY-MM-DD HH:mm:ss" 形式の JST 翌月初。SQL で `AT TIME ZONE 'Asia/Tokyo'` で UTC に変換 */
  monthEndJst: string
  /** "YYYY-MM-DD HH:mm:ss" 形式の JST 月初。SQL で `AT TIME ZONE 'Asia/Tokyo'` で UTC に変換 */
  monthStartJst: string
  /** "YYYY-MM" 形式の集計対象月（snapshot の year_month 列に保存） */
  yearMonth: string
}

/**
 * 集計結果 1 行。各 (yearMonth, languageId, userId) ごとに上位 10 位までを返す
 */
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
   * 上位 10 位の rows を UPSERT し、当月分のうち今回の result に含まれていない
   * (language_id, user_id) の行を DELETE する。順位入れ替わりや、当月の集計対象から
   * 外れたユーザー（plays が消えた、canPublicRanking=false に変更等）に追従するため。
   * yearMonth は rows[0].yearMonth で決定できるが、rows が空のケース（当月誰もプレイしていない）
   * に対応するため引数で受け取る
   */
  upsertMany: (rows: MonthlyRankingRow[], yearMonth: string) => Promise<void>
}

export class PrismaMonthlyRankingSnapshotRepository implements MonthlyRankingSnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  aggregateCurrentMonth = async (input: AggregateInput): Promise<MonthlyRankingRow[]> => {
    /**
     * 当月の play_sessions から (language_id, user_id) ごとの max(score) を取り、
     * tie-breaking 適用後の rank 付き上位 10 位までを返す。月境界は JST で判断する。
     * 上位 10 位限定の理由は docs/spec/monthly-ranking/README.md の
     * 「保存対象は各 (年月, 言語) ごとの上位 10 位まで」を参照
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
      WHERE rank <= 10
      ORDER BY "languageId", rank
    `
  }

  upsertMany = async (rows: MonthlyRankingRow[], yearMonth: string): Promise<void> => {
    /**
     * 当月分のうち今回 rows に含まれない行を DELETE する条件式を組み立てる。
     * rows が空（当月誰もプレイしていない）の場合は当月分の全行を削除する
     */
    const deleteCondition = rows.length === 0
      ? { yearMonth }
      : {
        NOT: {
          OR: rows.map((r) => ({ languageId: r.languageId, userId: r.userId })),
        },
        yearMonth,
      }

    /**
     * upsert と差分削除を 1 transaction にすることで、API SELECT が中途半端な
     * 状態を読まないようアトミックに切り替える
     */
    await this.prisma.$transaction([
      /** $transaction は PrismaPromise[] を要求するため async wrap は不可 */
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      ...rows.map((r) =>
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
      ),
      this.prisma.monthlyRankingSnapshot.deleteMany({ where: deleteCondition }),
    ])
  }
}
