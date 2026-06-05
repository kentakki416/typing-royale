-- CreateTable
CREATE TABLE "languages" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawled_repos" (
    "id" SERIAL NOT NULL,
    "github_id" BIGINT NOT NULL,
    "language_id" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "description" TEXT,
    "homepage" TEXT,
    "topics" JSONB NOT NULL DEFAULT '[]',
    "stars" INTEGER NOT NULL,
    "license" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "candidates_count" INTEGER NOT NULL DEFAULT 0,
    "stored_count" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "disabled_reason" TEXT,
    "crawled_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawled_repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" SERIAL NOT NULL,
    "crawled_repo_id" INTEGER NOT NULL,
    "language_id" INTEGER NOT NULL,
    "source_file_path" TEXT NOT NULL,
    "source_line_start" INTEGER NOT NULL,
    "source_line_end" INTEGER NOT NULL,
    "source_url" TEXT NOT NULL,
    "function_name" TEXT NOT NULL,
    "code_block" TEXT NOT NULL,
    "char_count" INTEGER NOT NULL,
    "line_count" INTEGER NOT NULL,
    "ast_hash" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawler_runs" (
    "id" SERIAL NOT NULL,
    "run_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "repos_processed" INTEGER NOT NULL DEFAULT 0,
    "problems_added" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawler_run_items" (
    "id" SERIAL NOT NULL,
    "crawler_run_id" INTEGER NOT NULL,
    "language_id" INTEGER NOT NULL,
    "target_owner" TEXT NOT NULL,
    "target_repo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "problems_added" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawler_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "languages_name_key" ON "languages"("name");

-- CreateIndex
CREATE UNIQUE INDEX "languages_slug_key" ON "languages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "crawled_repos_github_id_key" ON "crawled_repos"("github_id");

-- CreateIndex
CREATE INDEX "crawled_repos_language_id_disabled_idx" ON "crawled_repos"("language_id", "disabled");

-- CreateIndex
CREATE INDEX "problems_crawled_repo_id_idx" ON "problems"("crawled_repo_id");

-- CreateIndex
CREATE INDEX "problems_language_id_disabled_idx" ON "problems"("language_id", "disabled");

-- CreateIndex
CREATE UNIQUE INDEX "problems_language_id_ast_hash_key" ON "problems"("language_id", "ast_hash");

-- CreateIndex
CREATE INDEX "crawler_runs_run_type_status_started_at_idx" ON "crawler_runs"("run_type", "status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "crawler_run_items_crawler_run_id_status_idx" ON "crawler_run_items"("crawler_run_id", "status");

-- CreateIndex
CREATE INDEX "crawler_run_items_language_id_status_started_at_idx" ON "crawler_run_items"("language_id", "status", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "crawled_repos" ADD CONSTRAINT "crawled_repos_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_crawled_repo_id_fkey" FOREIGN KEY ("crawled_repo_id") REFERENCES "crawled_repos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawler_run_items" ADD CONSTRAINT "crawler_run_items_crawler_run_id_fkey" FOREIGN KEY ("crawler_run_id") REFERENCES "crawler_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawler_run_items" ADD CONSTRAINT "crawler_run_items_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
