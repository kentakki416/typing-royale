# step1: DB スキーマ追加（languages / crawled_repos / problems / crawler_runs / crawler_run_items）

`packages/db/prisma/schema.prisma` に problem-pool 関連の 5 テーブルを追加し、`packages/db/prisma/seed.ts` で `languages` の初期データ（TypeScript / JavaScript）を upsert する。後続 step（GitHub クライアント / processRepo）の前提となる土台を整える。

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

  crawledRepos    CrawledRepo[]
  problems        Problem[]
  crawlerRunItems CrawlerRunItem[]

  @@map("languages")
}

model CrawledRepo {
  id              Int      @id @default(autoincrement())
  githubId        BigInt   @unique @map("github_id") /// GitHub 上の repo id（API レスポンスの `id`）
  languageId      Int      @map("language_id")
  owner           String
  name            String
  fullName        String   @map("full_name") /// "owner/name"
  description     String?
  homepage        String?
  topics          Json     @default("[]")
  stars           Int
  license         String
  defaultBranch   String   @map("default_branch")
  commitSha       String   @map("commit_sha") /// クロール時の HEAD SHA
  candidatesCount Int      @default(0) @map("candidates_count") /// AST 解析で採用条件を満たした総数（サンプリング前、> 100 もあり得る）
  storedCount     Int      @default(0) @map("stored_count") /// 実際に problems に保存された件数（≤ 100、≤ candidatesCount）。> 0 = 過去に採用された
  disabled        Boolean  @default(false) /// 出題対象外（クローラ失敗 / 採用候補不足 / ライセンス変更 / 運営判断 等）
  disabledReason  String?  @map("disabled_reason") /// "too_few_problems" / "not_found" / "server_error" / "license_changed" / "rate_limit_exceeded" / "license_not_allowed"
  crawledAt       DateTime @map("crawled_at")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  language Language  @relation(fields: [languageId], references: [id])
  problems Problem[]

  @@index([languageId, disabled])
  @@map("crawled_repos")
}

model Problem {
  id              Int      @id @default(autoincrement())
  crawledRepoId   Int      @map("crawled_repo_id")
  languageId      Int      @map("language_id") /// crawledRepo.languageId と同じ値を非正規化保存（出題クエリで JOIN 回避 + 言語横断 hash 衝突防止）
  sourceFilePath  String   @map("source_file_path")
  sourceLineStart Int      @map("source_line_start")
  sourceLineEnd   Int      @map("source_line_end")
  sourceUrl       String   @map("source_url") /// GitHub 行範囲ハイライト付き URL
  functionName    String   @map("function_name")
  codeBlock       String   @map("code_block") /// コメント除去済みのタイピング対象コード
  charCount       Int      @map("char_count")
  lineCount       Int      @map("line_count")
  astHash         String   @map("ast_hash") /// SHA-256 hex 64 文字、コピペ重複排除用
  disabled        Boolean  @default(false) /// ライセンス再検証や運営の手動無効化で出題対象から外す
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  crawledRepo CrawledRepo @relation(fields: [crawledRepoId], references: [id])
  language    Language    @relation(fields: [languageId], references: [id])

  @@unique([languageId, astHash])
  @@index([crawledRepoId])
  @@index([languageId, disabled])
  @@map("problems")
}

model CrawlerRun {
  id             Int       @id @default(autoincrement())
  runType        String    @map("run_type") /// "full" / "license_recheck"
  status         String /// "running" / "success" / "failed"
  reposProcessed Int       @default(0) @map("repos_processed") /// この run で試行した repo 数（成功・失敗・skipped すべて含む。CrawlerRunItem 行数と一致）
  problemsAdded  Int       @default(0) @map("problems_added") /// この run で problems に INSERT された総件数（子の problems_added の合計）
  startedAt      DateTime  @map("started_at")
  endedAt        DateTime? @map("ended_at")
  error          Json?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  items CrawlerRunItem[]

  @@index([runType, status, startedAt(sort: Desc)])
  @@map("crawler_runs")
}

model CrawlerRunItem {
  id            Int       @id @default(autoincrement())
  crawlerRunId  Int       @map("crawler_run_id")
  languageId    Int       @map("language_id")
  targetOwner   String    @map("target_owner")
  targetRepo    String    @map("target_repo")
  status        String /// "success" / "failed" / "skipped"
  problemsAdded Int       @default(0) @map("problems_added") /// この repo で problems に INSERT された件数。failed / skipped は常に 0
  startedAt     DateTime  @map("started_at")
  endedAt       DateTime? @map("ended_at")
  error         Json?
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  crawlerRun CrawlerRun @relation(fields: [crawlerRunId], references: [id], onDelete: Cascade)
  language   Language   @relation(fields: [languageId], references: [id])

  @@index([crawlerRunId, status])
  @@index([languageId, status, startedAt(sort: Desc)])
  @@map("crawler_run_items")
}
```

#### 設計上の補足

- **`crawler_runs` と `crawler_run_items` の親子分離**：1 回の `pnpm crawler:run` で複数 repo を処理した場合、run 全体の集計と個別 repo の成否を独立して残せる。連続 2 回失敗（Slack 通知の根拠）も `crawler_run_items` を見れば repo 単位で判定可能。`onDelete: Cascade` で run が消えれば items も消える
- **`Problem.languageId` 非正規化**：出題側（`/solo`）は言語別抽選を `Problem.languageId` の単一テーブルクエリで完結させる（`crawled_repos` を JOIN しない）。`crawledRepo.languageId` との整合は Service 層の責務（INSERT 時に同じ値を入れる）
- **`Problem.disabled`**：ライセンス再検証で repo が disabled になったとき、または運営が個別問題を手動無効化したとき `true`。出題クエリは `WHERE languageId = ? AND disabled = false` で除外する
- **`@@unique([languageId, astHash])`**：JS と TS で偶然 hash が一致しても両方保持。`UNIQUE (astHash)` 単独だと先入れ言語が他言語を弾く
- **`candidatesCount` と `storedCount`**：採用候補総数（サンプリング前）と実際に保存された件数を分離。`candidatesCount > 100` の場合 `storedCount = 100`。「30 個以上で採用」のチェックは `candidatesCount >= 30` で行い、結果は `disabled` フラグだけに集約する（`eligible` の別カラムは持たない）
- **`disabled` 単独設計**：出題対象判定は `WHERE disabled = false` だけで完結。「過去に採用されたか」を知りたい場合は `storedCount > 0` で代用できる（`disabledReason` と組み合わせれば「採用後にライセンス変更で無効化」も識別可能）

### マイグレーションの生成

```bash
pnpm --filter @repo/db db:migrate
/** プロンプトでマイグレーション名を聞かれたら：problem_pool_initial */
```

生成される SQL を確認し、`CREATE TABLE languages / crawled_repos / problems / crawler_runs / crawler_run_items` と上記インデックスが含まれていることを確認する。

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

`packages/db` は Prisma 生成型を re-export しているので、`CrawledRepo` / `Problem` / `CrawlerRun` / `CrawlerRunItem` / `Language` 型が他 app から `import type { CrawledRepo } from "@repo/db"` で参照可能になっていることを `pnpm --filter @repo/db build` 後に確認。

### TODO.md の更新

Phase 2 の DB スキーマ項目（`languages` / `crawled_repos` / `problems` / `crawler_runs` + 親子分離した `crawler_run_items` / Prisma マイグレーション）を `[x]` にチェック。`crawled_repos` の `eligibleProblemCount` の表記が古い場合は `candidatesCount` / `storedCount` に揃える。`eligible` カラムは持たず `disabled` 単独で運用する点も併せて反映する。

## 動作確認

### マイグレーション適用とテーブル確認

```bash
pnpm --filter @repo/db db:migrate
psql "$DATABASE_URL" -c "\dt"
/** languages / crawled_repos / problems / crawler_runs / crawler_run_items が表示されることを確認 */

psql "$DATABASE_URL" -c "\d crawled_repos"
psql "$DATABASE_URL" -c "\d problems"
psql "$DATABASE_URL" -c "\d crawler_run_items"
/** カラム + 上記インデックス（特に problems の (language_id, ast_hash) UNIQUE）が存在することを確認 */
```

### Seed 実行

```bash
pnpm --filter @repo/db db:seed
psql "$DATABASE_URL" -c "SELECT * FROM languages;"
/** TypeScript / JavaScript の 2 行が出ることを確認 */
```

### Prisma 型生成の確認

```bash
pnpm --filter @repo/db build
/** generated client に CrawledRepo / Problem / CrawlerRun / CrawlerRunItem / Language が含まれている */
node -e "const { PrismaClient } = require('./packages/db/dist'); console.log(new PrismaClient().crawlerRunItem)"
```

### apps/api の test:ci が緑

DB スキーマ追加で既存テストが落ちないことを確認：

```bash
pnpm --filter api test
```

problem-pool 関連のロジックはまだ無いので、追加されたテーブルが空でも既存テストは通る。
