-- CreateTable
CREATE TABLE "rewards" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "asset_url" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hall_of_fame_entries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "language_id" INTEGER NOT NULL,
    "best_play_session_id" INTEGER NOT NULL,
    "comment" VARCHAR(300),
    "comment_submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hall_of_fame_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_configs" (
    "user_id" INTEGER NOT NULL,
    "display_items" JSONB NOT NULL DEFAULT '["grade", "best_score"]',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badge_configs_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "rewards_user_id_granted_at_idx" ON "rewards"("user_id", "granted_at" DESC);

-- CreateIndex
CREATE INDEX "hall_of_fame_entries_language_id_idx" ON "hall_of_fame_entries"("language_id");

-- CreateIndex
CREATE UNIQUE INDEX "hall_of_fame_entries_user_id_language_id_key" ON "hall_of_fame_entries"("user_id", "language_id");

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hall_of_fame_entries" ADD CONSTRAINT "hall_of_fame_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hall_of_fame_entries" ADD CONSTRAINT "hall_of_fame_entries_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hall_of_fame_entries" ADD CONSTRAINT "hall_of_fame_entries_best_play_session_id_fkey" FOREIGN KEY ("best_play_session_id") REFERENCES "play_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_configs" ADD CONSTRAINT "badge_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
