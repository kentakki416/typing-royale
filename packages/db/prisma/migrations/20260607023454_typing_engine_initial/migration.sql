-- CreateTable
CREATE TABLE "play_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "language_id" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "ghost_session_id" INTEGER,
    "crawled_repo_id" INTEGER NOT NULL,
    "typed_chars" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "score" INTEGER NOT NULL,
    "problems_played" INTEGER NOT NULL,
    "problems_completed" INTEGER NOT NULL,
    "mistype_stats" JSONB NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "play_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_session_problems" (
    "id" SERIAL NOT NULL,
    "play_session_id" INTEGER NOT NULL,
    "problem_id" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,
    "chars_typed" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "play_session_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keystroke_logs" (
    "play_session_id" INTEGER NOT NULL,
    "compressed_log" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keystroke_logs_pkey" PRIMARY KEY ("play_session_id")
);

-- CreateTable
CREATE TABLE "user_lifetime_stats" (
    "user_id" INTEGER NOT NULL,
    "total_typed_chars" BIGINT NOT NULL DEFAULT 0,
    "total_sessions" INTEGER NOT NULL DEFAULT 0,
    "best_score" INTEGER NOT NULL DEFAULT 0,
    "best_score_by_language" JSONB NOT NULL DEFAULT '{}',
    "current_grade" TEXT,
    "current_grade_reached_at" TIMESTAMP(3),
    "lifetime_mistype_stats" JSONB NOT NULL DEFAULT '{}',
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "last_played_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_lifetime_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "play_sessions_user_id_played_at_idx" ON "play_sessions"("user_id", "played_at" DESC);

-- CreateIndex
CREATE INDEX "play_sessions_language_id_score_idx" ON "play_sessions"("language_id", "score" DESC);

-- CreateIndex
CREATE INDEX "play_sessions_language_id_played_at_idx" ON "play_sessions"("language_id", "played_at" DESC);

-- CreateIndex
CREATE INDEX "play_session_problems_play_session_id_order_index_idx" ON "play_session_problems"("play_session_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "play_session_problems_play_session_id_order_index_key" ON "play_session_problems"("play_session_id", "order_index");

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_crawled_repo_id_fkey" FOREIGN KEY ("crawled_repo_id") REFERENCES "crawled_repos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_ghost_session_id_fkey" FOREIGN KEY ("ghost_session_id") REFERENCES "play_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_session_problems" ADD CONSTRAINT "play_session_problems_play_session_id_fkey" FOREIGN KEY ("play_session_id") REFERENCES "play_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_session_problems" ADD CONSTRAINT "play_session_problems_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keystroke_logs" ADD CONSTRAINT "keystroke_logs_play_session_id_fkey" FOREIGN KEY ("play_session_id") REFERENCES "play_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lifetime_stats" ADD CONSTRAINT "user_lifetime_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
