-- CreateTable
CREATE TABLE "monthly_ranking_snapshots" (
    "year_month" TEXT NOT NULL,
    "language_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_ranking_snapshots_pkey" PRIMARY KEY ("year_month","language_id","user_id")
);

-- CreateIndex
CREATE INDEX "monthly_ranking_snapshots_year_month_language_id_rank_idx" ON "monthly_ranking_snapshots"("year_month", "language_id", "rank");

-- AddForeignKey
ALTER TABLE "monthly_ranking_snapshots" ADD CONSTRAINT "monthly_ranking_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_ranking_snapshots" ADD CONSTRAINT "monthly_ranking_snapshots_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
