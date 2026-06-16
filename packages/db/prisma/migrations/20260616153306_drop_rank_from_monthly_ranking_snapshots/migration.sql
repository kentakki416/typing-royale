-- DropIndex
DROP INDEX "public"."monthly_ranking_snapshots_year_month_language_id_rank_idx";

-- AlterTable
ALTER TABLE "public"."monthly_ranking_snapshots" DROP COLUMN "rank";

-- CreateIndex
CREATE INDEX "monthly_ranking_snapshots_year_month_language_id_score_idx" ON "public"."monthly_ranking_snapshots"("year_month", "language_id", "score" DESC);
