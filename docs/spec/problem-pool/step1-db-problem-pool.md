# step1: DB スキーマ追加（languages / crawled_repos / problems / crawler_runs）

`packages/db/prisma/schema.prisma` に problem-pool 関連の 4 テーブルを追加し、`packages/db/prisma/seed.ts` で `languages` の初期データ（TypeScript / JavaScript）を upsert する。後続 step（GitHub クライアント / processRepo）の前提となる土台を整える。

## 対応内容

### `packages/db/prisma/schema.prisma` への追加

既存の `User` / `AuthAccount` 等の末尾に以下を追加。命名は CLAUDE.md の ESLint ルールに従い、Prisma 側は camelCase、DB 側は snake_case を `@map` で対応付ける。

```prisma
model Language {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  slug      String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  crawledRepos CrawledRepo[]

  @@map("languages")
}

model CrawledRepo {
  id                    Int      @id @default(autoincrement())
  /// GitHub 上の repo id（API レスポンスの `id`）
  githubId              BigInt   @unique @map("github_id")
  languageId            Int      @map("language_id")
  owner                 String
  name                  String
  /// "owner/name"
  fullName              String   @map("full_name")
  description           String?
  homepage              String?
  topics                Json     @default("[]")
  stars                 Int
  license               String
  defaultBranch         String   @map("default_branch")
  /// クロール時の HEAD SHA
  commitSha             String   @map("commit_sha")
  /// 採用候補 30 個以上 / 100 個までランダムサンプリング済みであれば true
  eligible              Boolean  @default(false)
  eligibleProblemCount  Int      @default(0) @map("eligible_problem_count")
  /// クローラ失敗 / ライセンス変更 / 採用候補不足 等で出題対象外
  disabled              Boolean  @default(false)
  /// "too_few_problems" / "not_found" / "server_error" / "license_changed" / "rate_limit_exceeded"
  disabledReason        String?  @map("disabled_reason")
  crawledAt             DateTime @map("crawled_at")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  language Language  @relation(fields: [languageId], references: [id])
  problems Problem[]

  @@index([languageId, eligible, disabled])
  @@map("crawled_repos")
}

model Problem {
  id              Int      @id @default(autoincrement())
  crawledRepoId   Int      @map("crawled_repo_id")
  sourceFilePath  String   @map("source_file_path")
  sourceLineStart Int      @map("source_line_start")
  sourceLineEnd   Int      @map("source_line_end")
  /// GitHub 行範囲ハイライト付き URL
  sourceUrl       String   @map("source_url")
  functionName    String   @map("function_name")
  /// コメント除去済みのタイピング対象コード
  codeBlock       String   @map("code_block")
  charCount       Int      @map("char_count")
  lineCount       Int      @map("line_count")
  /// SHA-256 hex 64 文字、コピペ重複排除用
  astHash         String   @unique @map("ast_hash")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  crawledRepo CrawledRepo @relation(fields: [crawledRepoId], references: [id])

  @@index([crawledRepoId])
  @@map("problems")
}

model CrawlerRun {
  id              Int       @id @default(autoincrement())
  /// "full" / "license_recheck"
  runType         String    @map("run_type")
  /// "running" / "success" / "failed"
  status          String
  reposProcessed  Int       @default(0) @map("repos_processed")
  problemsAdded   Int       @default(0) @map("problems_added")
  startedAt       DateTime  @map("started_at")
  endedAt         DateTime? @map("ended_at")
  error           Json?
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@index([runType, status, startedAt(sort: Desc)])
  @@map("crawler_runs")
}
```

### マイグレーションの生成

```bash
pnpm --filter @repo/db db:migrate
# プロンプトでマイグレーション名を聞かれたら：problem_pool_initial
```

生成される SQL を確認し、`CREATE TABLE languages / crawled_repos / problems / crawler_runs` と上記インデックスが含まれていることを確認する。

### `packages/db/prisma/seed.ts` に `languages` 追加

既存の dev users seed の前または後に以下を追加。`upsert` なので何度実行しても安全。

```typescript
const seedLanguages = async () => {
  const languages = [
    { name: "TypeScript", slug: "typescript" },
    { name: "JavaScript", slug: "javascript" },
  ]
  for (const lang of languages) {
    await prisma.language.upsert({
      create: { name: lang.name, slug: lang.slug },
      update: { name: lang.name },
      where: { slug: lang.slug },
    })
  }
}

await seedLanguages()
```

### `packages/db/src/index.ts` の re-export 確認

`packages/db` は Prisma 生成型を re-export しているので、`CrawledRepo` / `Problem` / `CrawlerRun` / `Language` 型が他 app から `import type { CrawledRepo } from "@repo/db"` で参照可能になっていることを `pnpm --filter @repo/db build` 後に確認。

### TODO.md の更新

Phase 2 の DB スキーマ項目（`languages` / `crawled_repos` / `problems` / `crawler_runs` / Prisma マイグレーション）を `[x]` にチェック。

## 動作確認

### マイグレーション適用とテーブル確認

```bash
pnpm --filter @repo/db db:migrate
psql "$DATABASE_URL" -c "\dt"
# languages / crawled_repos / problems / crawler_runs が表示されることを確認

psql "$DATABASE_URL" -c "\d crawled_repos"
# カラム + 上記インデックスが存在することを確認
```

### Seed 実行

```bash
pnpm --filter @repo/db db:seed
psql "$DATABASE_URL" -c "SELECT * FROM languages;"
# TypeScript / JavaScript の 2 行が出ることを確認
```

### Prisma 型生成の確認

```bash
pnpm --filter @repo/db build
# generated client に CrawledRepo / Problem / CrawlerRun / Language が含まれている
node -e "const { PrismaClient } = require('./packages/db/dist'); console.log(new PrismaClient().crawledRepo)"
```

### apps/api の test:ci が緑

DB スキーマ追加で既存テストが落ちないことを確認：

```bash
pnpm --filter api test
```

problems-pool 関連のロジックはまだ無いので、追加されたテーブルが空でも既存テストは通る。
