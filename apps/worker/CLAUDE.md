# apps/worker

BullMQ（現状の Queue 実装）からジョブを取り出して reward の SVG / PNG を生成する常駐型の worker プロセス。本番では ECS Service (long-running) を想定。

設計の全体像は [`docs/spec/rewards-worker/README.md`](../../docs/spec/rewards-worker/README.md) を参照。

## 設計の核: Queue 実装を差し替え可能にする

ジョブハンドラ (`src/jobs/*.ts`) は **`packages/queue` が公開する抽象 (`JobProcessor<T>` / `JobMessage<T>`) しか knows しない**。BullMQ の `Job` / `Worker` 型を直接 import するのは `packages/queue/src/bullmq-queue.ts` と `apps/worker/src/index.ts`（Redis 接続を作る所）だけ。

将来 SQS / GCP Cloud Tasks / pg-boss / Inngest 等に乗り換えるときは:

1. `packages/queue` に同じ `JobQueue<T>` interface を実装した別クラスを追加（例: `SqsJobQueue<T>`）
2. `apps/worker/src/index.ts` の `createRedisClient` + `startBullMQWorker` を新実装に置き換え

ジョブハンドラ自体 (`src/jobs/generate-reward.ts`) は無変更で済む。これが「疎結合」の意図。

## 含まれる Worker

| Queue 名 | ジョブ型 | 処理内容 |
| --- | --- | --- |
| `generate-reward` | `GenerateRewardJobData = { rewardId: number }` | reward 行を id で fetch し、type（grade_up / hall_of_fame_in / monthly_top_ten）に応じて SVG + PNG を生成して storage に保存、`generation_status` を completed に更新 |

enqueue する側は apps/api の `/finish`。pending 行を INSERT 後 `BullMQJobQueue.enqueue({ rewardId }, { jobId })` する。

## Commands

```bash
pnpm dev              # tsx watch で src/index.ts を起動（DATABASE_URL / REDIS_URL を env で渡す）
pnpm build            # dist/ にコンパイル
pnpm start            # dist/index.js を実行
pnpm lint             # ESLint
pnpm test             # Vitest（Prisma / generate-image を mock するので DB / Redis 不要）
```

env は dotenvx ではなく **process.env から直接読む**（ECS は Task Definition の secrets / environment で注入、ローカルは shell の env で渡す）。

## ディレクトリ構成

```
apps/worker/
  src/
    index.ts                       # PrismaClient / Redis / CardStorage を生成し、各 startXxxWorker を呼んで graceful shutdown に登録
    env.ts                         # Zod による env 検証 (safeParse → exit(1))
    lib/
      card-storage.ts              # PNG 保存ストレージ抽象（MVP: local filesystem）
    workers/                       # Queue 実装 + ハンドラを「結線」する組み立て層
      generate-reward-worker.ts    # startBullMQWorker(...) を呼んで JobConsumer を返す
    jobs/                          # 純粋なジョブハンドラ。Queue 実装を knows しない
      generate-reward.ts           # GenerateRewardDeps を受けて JobProcessor<GenerateRewardJobData> を返す factory
    runtime/
      graceful-shutdown.ts         # SIGTERM/SIGINT で consumers.close() → Prisma/Redis を閉じる
    repository/prisma/             # DB アクセス（api / cron と同じ構造）
      reward-repository.ts
      user-repository.ts
      index.ts                     # barrel export
  test/                            # vitest unit test
```

## レイヤード設計のルール

- **`jobs/<name>.ts`**: 純粋関数（`(deps) => JobProcessor<T>` の factory 形式）。`@repo/queue` から `JobProcessor<T>` / `JobMessage<T>` だけ import する。**BullMQ や ioredis を直接 import しない**
- **`workers/<name>-worker.ts`**: Queue 実装（現状は `startBullMQWorker`）と job ハンドラを結線するだけ。ここが Queue 実装を切り替えるときの唯一の差分対象
- **`repository/prisma/`**: `interface XxxRepository` + `class PrismaXxxRepository implements XxxRepository` のペア + barrel。apps/api とは意図的に分離し、必要な操作のみを持つ独自 interface を定義する
- **`runtime/graceful-shutdown.ts`**: SIGTERM/SIGINT を捕まえて全 `JobConsumer.close()` → Prisma/Redis 切断 → exit
- **`src/index.ts`**: 接続生成（Prisma / Redis）+ Repository / Storage インスタンス化 + 各 Worker 起動 + graceful shutdown 登録

### 冪等性は必須

BullMQ の stalled 検出 / リトライ / ECS deploy 時の SIGKILL 等で **同じジョブが複数回実行されうる**。`generateReward` は再実行されても安全なように:

- 既に `generation_status="completed"` かつ asset 済みなら no-op
- それ以外は再生成して上書き（PNG / SVG は決定的なので何度生成しても同じ）

## 環境変数

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | NODE_ENV !== "test" のとき必須 | - | Prisma の接続文字列 |
| `REDIS_URL` | NODE_ENV !== "test" のとき必須 | - | BullMQ 用 Redis 接続 URL |
| `REWARDS_CACHE_DIR` | no | `/tmp/typing-royale-rewards` | PNG の保存先。**apps/api と同じ値**にする |
| `REWARDS_PUBLIC_URL_PREFIX` | no | `/cache/rewards` | PNG の公開 URL prefix。apps/api と揃える |
| `WORKER_CONCURRENCY` | no | `10` | 1 worker あたりの同時並行ジョブ数 |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `LOGGER_TYPE` | no | `pino` | `pino` / `winston` / `console` / `silent` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |

## コードスタイル

ルート `CLAUDE.md` の規約に従う。Function style は **`const + arrow function`**。クラスメンバーは `public` / `private` 明示 + private には `_` プレフィックス必須。
