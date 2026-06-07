-- CreateTable
CREATE TABLE "user_language_best" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "language_id" INTEGER NOT NULL,
    "best_play_session_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "typed_chars" INTEGER NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_language_best_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_language_best_language_id_score_idx" ON "user_language_best"("language_id", "score" DESC);

-- CreateIndex
CREATE INDEX "user_language_best_user_id_idx" ON "user_language_best"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_language_best_user_id_language_id_key" ON "user_language_best"("user_id", "language_id");

-- AddForeignKey
ALTER TABLE "user_language_best" ADD CONSTRAINT "user_language_best_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_language_best" ADD CONSTRAINT "user_language_best_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_language_best" ADD CONSTRAINT "user_language_best_best_play_session_id_fkey" FOREIGN KEY ("best_play_session_id") REFERENCES "play_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
