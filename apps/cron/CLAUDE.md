# apps/cron

cron / EventBridge から定期実行されるタスク群を 1 つの Node.js ワーカーにまとめたパッケージ。本番は ECS Scheduled Task として起動される。

## 含まれるタスク

実装済みの定期実行タスクは以下の 2 つ。

| コマンド | スケジュール | 用途 |
| --- | --- | --- |
| `pnpm crawler:run:typescript` | 週次（月曜 03:00 JST） | GitHub 上の OSS（TypeScript）から問題プールを収集 |
| `pnpm crawler:license-recheck` | 月初 04:00 JST | 収集済み repo のライセンス再検証（言語非依存） |
| `pnpm batch:monthly-ranking` | 毎時 00 分 | 月間ランキング snapshot 更新（各 (年月, 言語) ごと上位 10 位まで） |

`batch:ranking`（毎時、言語別 snapshot 更新）は **未実装**：`src/task/ranking-batch.ts` には起動エントリのスタブのみが存在する。

CLI 名はそれぞれの機能名（crawler / batch）に合わせており、ディレクトリ名（cron）は「全部 cron 駆動」という実行モデルを表す。

**crawler は言語ごとに独立した task** として実装する：AST 抽出層が言語固有（現在は TypeScript Compiler API、将来追加する JavaScript や Go は別 parser）で、1 言語の rate limit / 障害を他言語に波及させないため。新言語追加時は `task/crawler-run-<slug>.ts` を新規作成し、`LANGUAGE_SLUG` と `RUN_TYPE = "crawler_<slug>"` をハードコードする（`crawler_runs.runType` で言語識別を区別する）。現時点では TypeScript のみ。

## Commands

```bash
pnpm dev                            # tsx watch で src/index.ts を起動（起動確認用）
pnpm build                          # dist/ にコンパイル
pnpm lint                           # ESLint
pnpm test                           # vitest run
pnpm crawler:run:typescript         # ローカルで 1 言語ぶんのクローラを 1 回実行
pnpm crawler:license-recheck        # ライセンス再検証を 1 回実行
```

すべての実行系コマンドは `dotenvx run -f .env.local -- ...` で wrap されており、`apps/cron/.env.local` から env を復号して読み込む（apps/api と同じパターン）。

## 環境変数

`apps/cron/.env.local` に dotenvx で暗号化して保管する：

- `NODE_ENV` `TZ`
- `DATABASE_URL` — apps/api と同じ（`postgresql://postgres:password@localhost:5432/project-template_dev`）
- `GITHUB_PAT` — 各自で発行して暗号化追記（`public_repo` スコープのみ、`pnpm dotenvx set GITHUB_PAT 'ghp_...' -f .env.local`）
- `CRAWLER_REPOS_PER_RUN` `CRAWLER_MIN_STARS` `CRAWLER_PUSHED_AFTER`（任意）

`.env.keys` は **ルート直下から symlink**（`ln -sf ../../.env.keys .env.keys`）。`DOTENV_PRIVATE_KEY_LOCAL` 1 つで apps/api と apps/cron 両方の `.env.local` を復号できる（`.env.local` という同名ファイルなら dotenvx が同じ鍵ペアを使い回す）。env スキーマと検証は `src/env.ts` に Zod で定義（`safeParse → process.exit(1)`）。

## ローカル動作確認

```bash
# 1. Postgres を起動（apps/api と共通の docker-compose）
cd <repo-root> && docker compose up -d postgres

# 2. migration / seed は apps/api 経由で当てる（apps/cron に db scripts なし）
cd apps/api && pnpm db:migrate && pnpm db:seed

# 3. クローラを 1 repo 実行（GITHUB_PAT 設定後）
cd apps/cron && pnpm crawler:run:typescript

# 4. DB 確認
docker exec typing-royale-postgres psql -U postgres -d project-template_dev \
  -c "SELECT full_name, candidates_count, stored_count, disabled, disabled_reason FROM crawled_repos;"
docker exec typing-royale-postgres psql -U postgres -d project-template_dev \
  -c "SELECT count(*) FROM problems;"
docker exec typing-royale-postgres psql -U postgres -d project-template_dev \
  -c "SELECT run_type, status, repos_processed, problems_added FROM crawler_runs;"
```

## ディレクトリ構成

ディレクトリ戦略（層の役割 / 設計ルール / 新タスク追加手順）は [`README.md#ディレクトリ戦略`](./README.md#ディレクトリ戦略) を参照。新しい task や service / client を追加するときは必ず README に従う。

要点（AI 向けサマリ）:

- **`task/<name>.ts`** は cron 1 本 = 1 ファイル。env を組み立てて Prisma / client / Repository を生成し service に DI するだけ。サブディレクトリは切らない。
- **`service/<domain>/`** に業務ロジックを置く（aggregator / verifier / orchestration など）。task 横断の再利用はここで集約する。**Repository class は service の中に書かない**。
- **`repository/prisma/`** に DB アクセスを集約する（apps/api と同じ構造）。`interface XxxRepository` + `class PrismaXxxRepository implements XxxRepository` のペアで、`index.ts` で barrel export する。
- **`client/<service>/`** に外部 API クライアント class を置く。env を直接 import しない（コンストラクタ DI）。
- **`ast/`** は TypeScript Compiler API のラッパ。
- **`lib/`** は env も DB も知らない純関数のみ。

`tasks/` （複数形）や `cli/` というディレクトリは作らない。task は単数形のディレクトリで `task/<name>.ts` のフラット配置に保つ。
service の中に Repository を置かない（DB アクセスは必ず `repository/prisma/` に分離）。

ロガーは `@repo/logger` を、それ以外の共通インフラは `@repo/db` / `@repo/redis` / `@repo/errors` を必要に応じて使う。env 検証は `src/env.ts` に Zod スキーマをインラインで定義する（`safeParse → process.exit(1)` のパターン。apps/api を参照）。graceful shutdown は `runtime/graceful-shutdown.ts` の `setupGracefulShutdown(prisma)` を task 冒頭で呼ぶだけ（SIGTERM / SIGINT で Prisma を disconnect して exit）。

実処理は順次追加する。設計詳細は [`docs/spec/problem-pool/`](../../docs/spec/problem-pool/) と [`docs/spec/score-ranking/`](../../docs/spec/score-ranking/) を参照。

## コードスタイル

ルート `CLAUDE.md` の「Code Style and Linting」と同じ規約に従う。Function style は API と同じく `const + arrow function` を使う。
