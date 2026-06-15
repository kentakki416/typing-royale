# apps/cron セットアップ手順

`apps/cron`（GitHub 週次クローラ・月次ライセンス再検証・毎時ランキング集計をまとめた ECS Scheduled Task）のローカル開発・動作確認手順。アーキテクチャや層の責務は [`apps/cron/README.md`](../../apps/cron/README.md) を参照。

ローカルで apps/api / apps/web の動作確認をするには、cron を一度走らせて problem-pool テーブルに OSS 関数を投入しておく必要がある（typing-engine が出題する関数の供給元が cron のため）。

## 目次

- [1. 前提ツール](#1-前提ツール)
- [2. 依存パッケージのインストール](#2-依存パッケージのインストール)
- [3. 環境変数 (.env.local) の準備](#3-環境変数-envlocal-の準備)
- [4. Postgres を起動して migration を流す](#4-postgres-を起動して-migration-を流す)
- [5. dev サーバー起動（起動確認）](#5-dev-サーバー起動起動確認)
- [6. cron タスクをローカル実行](#6-cron-タスクをローカル実行)
- [7. テスト実行](#7-テスト実行)

## 1. 前提ツール

- Node.js >= 18.0.0
- pnpm >= 9.0.0
- Docker (Postgres をローカル起動するため)
- GitHub Personal Access Token (PAT)（クローラを動かすときのみ。`public_repo` スコープで十分）

```bash
node --version
pnpm --version
docker --version
```

## 2. 依存パッケージのインストール

ワークスペース全体のインストールは **プロジェクトルートから** 実行する。

```bash
cd <project-root>
pnpm install
pnpm --filter @repo/schema build      # スキーマは依存より先にビルドが必要
pnpm --filter @repo/db build          # cron は @repo/db を direct import するため必要
```

## 3. 環境変数 (.env.local) の準備

`apps/cron/.env.local` は [dotenvx](https://dotenvx.com/) で暗号化されている。復号鍵 `.env.keys` を管理者から受け取って **プロジェクトルートに配置**する（`apps/cron/.env.keys` はルートへのシンボリックリンク）。鍵の配置については [docs/setup/api.md](./api.md#3-環境変数-envkeys-の配置) と同じ。

cron が参照する主な環境変数:

| キー | 必須 | 用途 |
|---|---|---|
| `DATABASE_URL` | NODE_ENV != test で必須 | Postgres 接続文字列（例: `postgresql://postgres:password@localhost:5432/typing_royale_dev`） |
| `GITHUB_PAT` | NODE_ENV != test で必須 | GitHub REST / Search API 用 PAT。`public_repo` スコープで OK |
| `CRAWLER_MIN_STARS` | 任意（default 1000） | クローラが拾う最低 Star 数 |
| `CRAWLER_REPOS_PER_RUN` | 任意（default 1） | 1 回の実行で処理するリポジトリ数（ローカル検証は 1〜2 が現実的） |
| `LOG_LEVEL` | 任意（default info） | `debug` にするとクローラの API 呼び出し詳細が出る |

env スキーマの実体は [`apps/cron/src/env.ts`](../../apps/cron/src/env.ts) を参照。起動時に safeParse が走り、不正な env なら `process.exit(1)` で停止する。

> ⚠️ `apps/cron` ディレクトリで `cd` してから `dotenvx set` を叩くと、シンボリックリンクが実体ファイルで上書きされて鍵が壊れる。値の追加・更新は **必ずプロジェクトルートから** `npx dotenvx set KEY "value" -f apps/cron/.env.local` を実行すること。

## 4. Postgres を起動して migration を流す

apps/api のセットアップ手順 (docs/setup/api.md) で Postgres コンテナをすでに起動している場合はそのまま流用する。まだ起動していなければ:

```bash
cd <project-root>
docker compose up -d postgres
docker compose ps                     # postgres が healthy か確認
```

migration が未適用なら apps/api 側で流しておく:

```bash
cd apps/api
pnpm db:generate
pnpm db:migrate
```

cron は `@repo/db` の Prisma スキーマを共有しているため、別途 migration コマンドを持たない。

## 5. dev サーバー起動（起動確認）

`pnpm dev` は `src/index.ts` を tsx watch で起動するだけのスモークチェック。env が正しく組み立てられているか、`@repo/logger` が初期化できるかを確認する用途。

```bash
cd apps/cron
pnpm dev
# {"level":30,"time":...,"msg":"cron package booted","env":"local"}
```

実際のクローラ / バッチは `src/task/<name>.ts` 配下にあり、`pnpm <script>` で個別に起動する（手順 6）。

## 6. cron タスクをローカル実行

ECS Scheduled Task で本番運用される 3 つのジョブを、ローカルでも `pnpm <script>` で 1 回起動できる。Phase 0 ではエントリの雛形のみ。Phase 2 以降で実処理が入る:

| コマンド | フェーズ | 用途 |
|---|---|---|
| `pnpm crawler:run:typescript` | Phase 2 | TypeScript 週次クローラ（GitHub API → AST → problem-pool 投入） |
| `pnpm crawler:license-recheck` | Phase 2 | 月次ライセンス再検証（言語非依存） |
| `pnpm batch:ranking` | Phase 4 | 毎時ランキング集計 |

ローカルで apps/api / apps/web の動作確認用に problem-pool を埋めたいときは、まず TypeScript クローラを少数回数で回す:

```bash
cd apps/cron

# 1 回の run で 1 リポジトリだけ処理する（env で CRAWLER_REPOS_PER_RUN=1 を指定しておく）
pnpm crawler:run:typescript

# 投入結果は apps/api 側で Prisma Studio から確認できる
cd ../api
npx prisma studio --url "postgresql://postgres:password@localhost:5432/typing_royale_dev"
```

GitHub API の rate limit を踏まないよう、ローカル検証では `CRAWLER_REPOS_PER_RUN` を小さく（1〜3）に絞ること。

## 7. テスト実行

cron 側は API ほど DB を多用しないため、基本は Service ユニットテスト中心。

```bash
cd apps/cron
pnpm test                   # 全テスト (vitest run)
pnpm test:watch             # watch モード
```

テスト設計方針（mock / fixture / 境界値）は [`apps/cron/CLAUDE.md`](../../apps/cron/CLAUDE.md) を参照。
