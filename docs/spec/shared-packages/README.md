# shared-packages

> ⚠️ **`@repo/config` は撤去済み（2026-06-04）**。
> env 検証は各 app の `src/env.ts` に Zod スキーマ + `safeParse → process.exit(1)` を**インラインで**定義する方針に変更。詳細は本文 [env 検証方針（旧 `@repo/config` 廃止後）](#env-検証方針旧-repoconfig-廃止後) を参照。
> 残った `@repo/config` への言及は **撤去前の歴史的経緯** を説明する文脈に限定している。step4 (`step4-packages-config.md`) は **アーカイブ** 扱い。

このテンプレートが想定するユースケース（api / cron / worker / batch などの複数 server-side アプリ）で共通利用される基盤コードを `packages/` 配下に切り出し、新規 server-side app をテンプレートからスピンアップした時にゼロから書き直さずに済む状態にする。

対象は以下の 4 パッケージ:

- `@repo/db` — Prisma schema / generated client / 接続クライアント
- `@repo/logger` — Logger インターフェース + Pino/Winston/Console/Silent 実装 + リクエストコンテキスト
- `@repo/errors` — `Result<T>` 型と業務エラーのヘルパ
- `@repo/redis` — ioredis 接続クライアント（singleton + factory）

このドキュメントは **仕様（What）** と **設計（How）** を分けて記述する：

- **仕様**：テンプレート利用者・将来の server-side app 実装者から見える挙動・ルール・利用方法
- **設計**：実装にあたっての技術的な選択と制約

## 関連 spec

- [`../dev-login/README.md`](../dev-login/README.md) — dev-login の API は `@repo/logger` / `@repo/errors` / `@repo/db` をすべて利用する。移行時の参照実装になる

## 目次

- [仕様](#仕様)
  - [パッケージ全体像](#パッケージ全体像)
  - [`@repo/db` の仕様](#repodb-の仕様)
  - [`@repo/logger` の仕様](#repologger-の仕様)
  - [`@repo/errors` の仕様](#repoerrors-の仕様)
  - [`@repo/redis` の仕様](#reporedis-の仕様)
  - [テンプレート利用フロー](#テンプレート利用フロー)
- [設計](#設計)
  - [パッケージ境界の原則](#パッケージ境界の原則)
  - [Repository / Service の共通化方針](#repository--service-の共通化方針)
  - [`@repo/db` の設計](#repodb-の設計)
  - [`@repo/logger` の設計](#repologger-の設計)
  - [`@repo/errors` の設計](#repoerrors-の設計)
  - [`@repo/redis` の設計](#reporedis-の設計)
  - [ビルド順序と Turborepo タスク](#ビルド順序と-turborepo-タスク)
  - [段階移行戦略](#段階移行戦略)
  - [MVP 対象外（将来検討）](#mvp-対象外将来検討)
- [必要な画面](#必要な画面)
- [必要な API](#必要な-api)
- [必要な DB 設計](#必要な-db-設計)
- [フロー図](#フロー図)

---

## 仕様

### パッケージ全体像

```mermaid
flowchart LR
    subgraph packages
        DB["@repo/db<br/>Prisma schema + client"]
        LOG["@repo/logger<br/>ILogger + factory"]
        ERR["@repo/errors<br/>Result&lt;T&gt; + ApiError"]
        RDS["@repo/redis<br/>ioredis client"]
        SCH["@repo/api-schema<br/>(既存)"]
    end

    subgraph apps
        API[apps/api]
        CRON[apps/cron]
        WORKER["apps/worker<br/>(将来)"]
    end

    API --> DB
    API --> LOG
    API --> ERR
    API --> RDS
    API --> SCH

    CRON --> DB
    CRON --> LOG
    CRON --> ERR
    CRON --> RDS

    WORKER -.-> DB
    WORKER -.-> LOG
    WORKER -.-> ERR
    WORKER -.-> RDS
```

`@repo/db` / `@repo/logger` / `@repo/errors` / `@repo/redis` はすべて **Node 専用** パッケージ。`apps/web` / `apps/admin` / `apps/mobile` などのクライアント側からは原則 import しない（フロント用の logger / error は別途必要になった時点で `@repo/logger-client` 等として切り出す方針）。

各 app の env 検証は、専用パッケージを置かず **app ごとの `src/env.ts` に Zod スキーマと `safeParse → process.exit(1)` をインラインで定義する**方針（旧 `@repo/config` は撤去済み）。理由は各 app の env が読み込み元 (`process.env`) を 1 箇所に集約しつつ、shared package を介さず自己完結で読めるため。

### `@repo/db` の仕様

- Prisma の `schema.prisma` / `migrations/` / generated client を集約する正本
- 利用側 app は **factory `createPrismaClient()` のみ** を import し、各 app の起動コード (`src/index.ts` 等) で 1 回呼んで PrismaClient を生成する。`packages/db` 側では singleton を持たない
- 生成した PrismaClient は Repository コンストラクタに DI で渡す（既存パターンを踏襲）
- Prisma が生成する **ドメイン型は `@repo/db` から re-export** される（例：`import type { User, Memo } from "@repo/db"`）
- マイグレーション / generate / seed のコマンドは `packages/db` の package.json に閉じ込め、各 app からは叩かない
  - `pnpm --filter @repo/db db:generate`
  - `pnpm --filter @repo/db db:migrate`
  - `pnpm --filter @repo/db db:migrate:deploy`
  - `pnpm --filter @repo/db db:seed`
  - `pnpm --filter @repo/db db:studio`
- `DB_NAME` 環境変数による DB 名上書き（テスト DB 用）の挙動は維持する。テストでは `createPrismaClient({ url: testDbUrl })` を test setup で 1 つ作って使い回す
- **read replica 対応**：`createPrismaClient({ replicaUrl })` で replica URL を渡すと `@prisma/extension-read-replicas` 経由で自動振り分け（read は replica、write / `$transaction` は primary）。`replicaUrl` 省略時は `process.env.DATABASE_REPLICA_URL` を読む。明示的に primary 強制が必要な read は `prisma.$primary().user.findUnique(...)` で切り替え可能

### `@repo/logger` の仕様

- `ILogger` インターフェースに沿って `debug` / `info` / `warn` / `error` のメソッドを提供
- `LoggerFactory.getLogger()` で **環境変数 `LOGGER_TYPE` に応じた logger** を取得（singleton）
  - `pino`（デフォルト・推奨）/ `winston` / `console` / `silent`
- `logger` という名前で **app 全体共通のデフォルト logger を export** する（`import { logger } from "@repo/logger"`）
- リクエストスコープの値（requestId / userId 等）を渡す `logContext` を提供し、AsyncLocalStorage で全 logger 実装に伝播
- 各 logger 実装は `LogMetadata` オブジェクトでメタデータを受け取り、構造化ログとして出力する
- cron / worker からも同じ logger を使えるよう、Express / Next.js への依存は持たない

### `@repo/errors` の仕様

- `Result<T>` 型と `ok(value)` / `err(apiError)` のヘルパを提供
- `ApiError` の `type` は `BAD_REQUEST` / `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `CONFLICT` の 5 種類
- 業務エラー生成のヘルパ関数を提供：`badRequestError(msg)` / `unauthorizedError(msg)` / `forbiddenError(msg)` / `notFoundError(msg)` / `conflictError(msg)`
- DB 障害などの想定外エラーは **throw** が原則で、`Result` には乗せない（既存ルールを維持）
- cron / worker でも同じ `Result<T>` を使うことで、Service 層のコードを app 横断で再利用しやすくする

### `@repo/redis` の仕様

- ioredis の **factory `createRedisClient({ url?, options? })` のみを提供** する。`packages/redis` 側に singleton を持たない（`@repo/db` と同じ方針）
- 各 app の起動コードで factory を呼んで Redis client を生成し、Repository コンストラクタに DI で渡す
- `REDIS_URL` を最優先で読み、無ければ `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` から組み立てる（既存挙動の後方互換）
- ioredis の型（`Redis` / `RedisOptions`）を re-export し、利用側は `@repo/redis` 経由で参照する（依存方向を packages に集約）
- Repository 実装（例：refresh token / cache / job queue）は **app 側** に置く（app ごとにキー設計や TTL が異なるため packages では責務外）
- **1 app で複数 Redis 接続が必要なケース**：BullMQ の Worker / QueueEvents、Pub/Sub の subscriber は専用接続が必須なので、`createRedisClient` を **複数回呼んで使い分ける**
  - cache / session 用：`createRedisClient()`（デフォルト設定）
  - BullMQ Queue / Worker 用：`createRedisClient({ options: { maxRetriesPerRequest: null } })`（BullMQ の要件）
  - Pub/Sub subscriber 用：`createRedisClient()`（subscribe するとそのコネクションは通常コマンド不可になるため別接続が必須）

### テンプレート利用フロー

新規 server-side app（例：cron）をテンプレートから派生させる場合、以下のフローを想定：

1. `apps/cron/` を新規作成し、`package.json` に依存を追加
   ```json
   {
     "dependencies": {
       "@repo/db": "workspace:^",
       "@repo/logger": "workspace:^",
       "@repo/errors": "workspace:^",
       "@repo/redis": "workspace:^"
     }
   }
   ```
2. `src/env.ts` に Zod スキーマと `safeParse → process.exit(1)` をインラインで定義（`@repo/config` のような共通パッケージは介さない）
   ```typescript
   import { z } from "zod"

   const envSchema = z.object({
     NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
     DATABASE_URL: z.string().url(),
     REDIS_URL: z.string().url().optional(),
   })

   const parsed = envSchema.safeParse(process.env)
   if (!parsed.success) {
     console.error("Invalid environment variables:", parsed.error.format())
     process.exit(1)
   }
   export const env = parsed.data
   ```
3. `src/index.ts` でインフラ client を起動（接続を持つ client は **factory で 1 回作って使い回す**）
   ```typescript
   import { createPrismaClient } from "@repo/db"
   import { logger } from "@repo/logger"
   import { createRedisClient } from "@repo/redis"

   import { env } from "./env"

   const prisma = createPrismaClient()
   const redis = createRedisClient()

   logger.info("cron started", { env: env.NODE_ENV })

   const count = await prisma.user.count()
   await redis.set("cron:last-user-count", count, "EX", 3600)
   logger.info("user count cached", { count })

   await prisma.$disconnect()
   await redis.quit()
   ```
4. Repository / Service は既存パターン（`Result<T>` + `repo: { ... }`）を踏襲し、`prisma` / `redis` は Repository コンストラクタに DI で渡す

---

## 設計

### パッケージ境界の原則

| 観点 | ルール |
| --- | --- |
| **責務最小化** | 各パッケージは「共通 1 機能」に絞る。Repository や Service の orchestration は packages に置かない（詳細は次節 [Repository / Service の共通化方針](#repository--service-の共通化方針)） |
| **依存方向** | `@repo/errors` は他 packages に依存しない。`@repo/logger` は `@repo/errors` のみ任意依存可。`@repo/db` は `@repo/errors` / `@repo/logger` のいずれにも依存しない（型レベルで切り離す） |
| **Node 専用** | すべて Node 専用。Next.js / Expo の client bundle に混入させない |
| **環境変数の読み込み** | env 検証は各 app の `src/env.ts` にインライン定義。共通パッケージ側では原則 `process.env` を直接読まず、引数で受け取る（テスタビリティ確保）。例外として `@repo/db` の接続文字列ヘルパや `@repo/redis` の URL フォールバックは Prisma CLI からも呼ばれるため `process.env` を直接参照する |
| **接続を持つものは factory のみ** | `@repo/db` / `@repo/redis` は **factory のみ** を export し、singleton を持たない。client の生成・破棄は app 側 (`src/index.ts`) の責務。logger / errors / config のように接続を持たないものは singleton / 純関数で OK |
| **副作用** | `package.json` に `"sideEffects": false` を付ける。tree-shaking 可能にする |

### Repository / Service の共通化方針

複数の server-side app（api / cron / 将来の realtime / worker）が同じ DB スキーマを参照する状況で、**Repository / Service をどこに置くか**の原則を定める。

#### TL;DR

| 層 | 置き場所 | 理由 |
| --- | --- | --- |
| **Prisma schema / 生成型 / factory** | `@repo/db`（共通） | 真の重複。型は TS の安全網として全 app に伝播させたい |
| **Repository class**（Prisma 呼び出し + Domain 型変換） | **各 app 内**（`apps/<name>/src/repository/` または `service/<domain>/`） | 同じテーブルでも app ごとに読み書き要件・cache 戦略・Domain 型が異なる |
| **Service の orchestration**（Repository + client を組み立てる手順） | **各 app 内**（`apps/<name>/src/service/`） | I/O を束ねるロジックは app に閉じている |
| **Service の pure domain logic**（I/O なしの計算・ルール・定数） | 2 app 以上で必要になったら **小さなドメイン特化パッケージ**に切り出す | 依存も I/O も無いので結合コストが小さく、共通化のメリットが効く |

#### Repository を共通化しない理由

スキーマが共通でも、Repository は app ごとに置く。

1. **読み書きの関心がほぼ重ならない**
   同じ `problems` テーブルでも、cron は `bulkCreateSkippingDuplicates` / `markDisabledByCrawledRepoId`（書き中心）、api は `findByLanguageRandom` / `findById`（読み中心）と、必要なメソッドが 90% 別物になる。共通 Repository にすると「各 app が半分ずつ使う太いクラス」になる。

2. **Domain 型が app ごとに違う**
   cron の `CrawledRepoDomain` は `pickNextRepo` 用に `id / owner / name / commitSha / languageId / license` だけの薄い型。api が表示用に持つ Domain 型はまた別。同じ DB テーブルでも、**app から見たエンティティの形は別物** という前提で各 app が必要な分だけ Domain 型を持つ方が綺麗に切れる。

3. **キャッシュ・レプリカ・トランザクション戦略が app ごとに違う**

   | app | アクセス頻度 | キャッシュ | replica | transaction |
   | --- | --- | --- | --- | --- |
   | api（プロフィール表示） | 低 | 1 秒 TTL | OK | リクエスト単位 |
   | realtime（マッチ参加） | 超高 | 30 秒 LRU 必須 | OK | 不要 |
   | cron（クローラ） | 中 | 不要 | primary | `$transaction` で複数 write |

   `findById` 一つとっても、キャッシュをどこに入れるか・どの replica を使うかの要件が違う。共通化すると `{cache?: boolean, replica?: boolean}` のような設定オプションだらけになり、Prisma を直接叩くのと変わらない薄ラッパに退化する。

4. **デプロイ独立性が崩れる**
   共通 Repository を 1 メソッド変えると、全消費 app が再ビルド・再デプロイ対象になる。app の境界をデプロイ単位の境界に揃えておく方が、変更影響を読みやすい。

5. **共通化で減るコードは思ったより少ない**
   Repository の中身は Prisma 呼び出し + Domain 型への詰め替えがほとんどで、共通化の旨味は小さい。一方、結合コストは app の数だけ線形に増える。

#### スキーマ変更時の対処

「Repository が app の数だけある → スキーマ変更で全部更新が必要では？」という懸念は正しいが、実害は小さい：

- **大半のスキーマ変更は追加**（新カラム / 新テーブル / 新インデックス）で、既存 Repository を触る必要がない
- **破壊的変更**（rename / 削除 / 型変更）は年に数回レベル。発生したときは `@repo/db` の型再生成で**全 app の `tsc` が壊れた箇所をリストアップしてくれる**ので、人間が「どこを直すか」を覚えておく必要がない
- 各 Repository の `_toDomain` メソッド（生 row → Domain 型変換）に raw 列名への依存を集めておくことで、**スキーマ変更の波が Repository より外に伝播しない**

```ts
/** 例：列名変更を Repository 内に閉じ込めるパターン */
private _toDomain = (row: PrismaCrawledRepo): CrawledRepoDomain => ({
  id: row.id,
  commitSha: row.commitSha,    // スキーマで commit_sha → head_commit になっても、
  fullName: row.fullName,      // 修正は _toDomain の 1 行で済み、ビジネスロジックは無傷
})
```

#### Service の orchestration を共通化しない理由

Service には **orchestration**（Repository / client を組み立てる手順）と **pure domain logic**（I/O なしの計算・ルール）の 2 種類が混在する。Orchestration は Repository と同じ理由で app 単位：

- 使う Repository / external client の組み合わせが app ごとに違う
- エラーハンドリング・retry 戦略・logger コンテキストが app ごとに違う
- DI 構造が app の `src/index.ts` / `task/<name>.ts` に閉じる

例：cron の `processRepo` は GithubClient + 3 種類の Repository + AST モジュールを束ねる手順。api の `authenticateWithGoogle` は GoogleOAuthClient + UserRepo + AuthAccountRepo + RefreshTokenRepo を束ねる手順。それぞれ別 app の責務であり、共通化する余地が無い。

#### Pure domain logic は共通化を検討する（ただし注意点あり）

I/O も依存も無い純粋ロジック（計算式・定数・判定関数）は、**結合コストがほぼゼロ**なので共通化のメリットが効く。

このプロジェクトで該当しそうな候補：

| 候補 | 使う app | 共通化判断 |
| --- | --- | --- |
| 許可ライセンスのセット（MIT / Apache-2.0 / BSD-3-Clause / ISC） | cron (processRepo, licenseRecheck) + 将来 api（バッジ表示） | 2 app で必要になったら共通化 |
| WPM / スコア計算式 | 将来 api（マッチ結果記録）+ realtime（試合中の表示） | 2 app で必要になったら共通化 |
| ランキング集計式 | api のみ（`user_language_best` リアルタイム集計 + `/finish` の月間 snapshot UPSERT） | api 内で完結。共通化しない |
| AST hash 正規化 | cron のみ | 共通化しない |

#### 共通化するときの置き場ルール

pure logic を共通化する際、**`@repo/service` のような汎用パッケージは作らない**。`@repo/db` 以外の domain 層は、必ず `@repo/<domain>` の小さな焦点パッケージとして切る：

```
packages/
├── db/                  # ✅ 既存：Prisma factory + 生成型
├── api-schema/          # ✅ 既存：Zod スキーマ
├── logger/              # ✅ 既存：ロガー
├── errors/              # ✅ 既存：Result / ApiError
├── redis/               # ✅ 既存：Redis factory
│
├── scoring/             # 🟡 将来：WPM / スコア計算（pure function のみ）
├── license-policy/      # 🟡 将来：許可ライセンスのセット + 判定関数
└── ranking-formula/     # 🟡 将来：ランキング集計式
```

**ルール**：
- 1 パッケージ = 1 ドメインの pure logic
- pure function / 定数 / 型のみ。状態を持たない、I/O を持たない、DB を知らない
- 名前は必ず domain 名（`@repo/<domain>`）。`@repo/service` / `@repo/utils` / `@repo/common` のような汎用名は作らない（結合の温床になる）

#### 共通化のトリガー条件

**2 つ目の app で同じ pure logic が必要になった瞬間** に共通化を検討する。1 つの app しか使わないうちは各 app 内に置いておく（YAGNI）。

判断順序：
1. **その logic は pure か？**（I/O / DB / 状態に依存しない）→ NO なら共通化しない
2. **2 app 以上で同一のものが必要になったか？** → NO なら app 内に置いたままにする
3. **YES なら**、`packages/<domain>/` を新設して移動。両 app は `@repo/<domain>` 経由で使う

これにより「とりあえず共通にしておこう」という事前最適化を避け、実際の重複が見えてから共通化できる。

### `@repo/db` の設計

```
packages/db/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── prisma/
│   ├── schema.prisma                # apps/api/src/prisma/schema.prisma を移設
│   ├── migrations/                  # apps/api/src/prisma/migrations/ を移設
│   ├── prisma.config.ts             # apps/api/src/prisma/prisma.config.ts を移設
│   ├── seed.ts                      # dev users / 言語マスタを upsert
│   └── seed-ranking-fixtures.ts     # ローカル動作確認用のランキング fixture
├── src/
│   ├── client.ts              # createPrismaClient factory + 接続文字列ヘルパ (DB_NAME 上書き含む)
│   └── index.ts               # client + generated 型の re-export
└── generated/                 # prisma generate の出力先（tracked）
```

#### Prisma クライアントの提供形態

**factory `createPrismaClient` のみを export する**。`packages/db` 側に singleton を持たない。各 app の起動コードで factory を呼び、生成した client を Repository に DI で渡す。

```typescript
import { PrismaPg } from "@prisma/adapter-pg"
import { readReplicas } from "@prisma/extension-read-replicas"

import { PrismaClient } from "../generated/client"
import { buildConnectionString } from "./connection-string"

export type CreatePrismaClientOptions = {
  /**
   * 接続文字列を明示指定。省略時は process.env.DATABASE_URL (+ DB_NAME 上書き)
   */
  url?: string
  /**
   * read replica の接続文字列。省略時は process.env.DATABASE_REPLICA_URL を読み、
   * それも無ければ replica を使わない（primary のみで read/write 両方を扱う）
   */
  replicaUrl?: string
}

/**
 * PrismaClient のファクトリ
 * 各 app の src/index.ts で 1 回呼び、Repository コンストラクタに渡す。
 * read replica が設定されていれば @prisma/extension-read-replicas で自動振り分け：
 *   - findMany / findUnique / count / aggregate などの read → replica
 *   - create / update / delete / $transaction / $executeRaw → primary
 * 強整合性が必要な read は (prisma as any).$primary().user.findUnique(...) で primary 強制
 *
 * 戻り値は PrismaClient 型に揃えている（extension の戻り値は別型になるため、
 * Repository コンストラクタの互換性確保のためにキャストしている）。
 */
export const createPrismaClient = (options: CreatePrismaClientOptions = {}): PrismaClient => {
  const adapter = new PrismaPg(options.url ?? buildConnectionString())
  const base = new PrismaClient({ adapter })
  const replicaUrl = options.replicaUrl ?? process.env.DATABASE_REPLICA_URL
  if (!replicaUrl) return base
  const replicaAdapter = new PrismaPg(replicaUrl)
  const replica = new PrismaClient({ adapter: replicaAdapter })
  return base.$extends(readReplicas({ replicas: [replica] })) as unknown as PrismaClient
}
```

#### singleton を持たない理由

- **接続を持つものはモジュール import の副作用にしない**：`import { prisma }` の瞬間に DB 接続が始まる singleton は、テスト・スクリプト・CLI ツールから import するだけで意図しない接続が走るリスクがある。factory なら `createPrismaClient()` を **呼んだ時にだけ** 接続される
- **既存の DI パターンと一貫**：Repository は constructor で `PrismaClient` を受け取る形になっており、その引数を作るのは最上位 (`src/index.ts`) の責務。singleton import で済ませると「Repository は DI、その手前は singleton」という捻れが発生する
- **テストが書きやすい**：test setup は `createPrismaClient({ url: testDbUrl })` で test DB 専用 client を 1 つ作るだけ。本番 singleton との二重 import 問題が起きない
- **ライフサイクルが明示的**：`apps/api/src/index.ts` で `createPrismaClient()` → ルート組み立て → `process.on("SIGTERM", () => prisma.$disconnect())` まで一貫して書ける
- **将来のマルチ DB / マルチテナント拡張に強い**：DB-per-tenant が必要になっても、リクエストごとに `createPrismaClient({ url: tenantUrl })` を呼べば対応できる

#### app 側の利用例

```typescript
// apps/api/src/index.ts
import { createPrismaClient } from "@repo/db"

const prisma = createPrismaClient()

const memoRepository = new PrismaMemoRepository(prisma)
const userRepository = new PrismaUserRepository(prisma)
/** ... 他の Repository も同じ prisma を渡す ... */

process.on("SIGTERM", async () => {
  await prisma.$disconnect()
  process.exit(0)
})
```

#### `$primary()` の使い方（read replica 利用時）

```typescript
/** デフォルト：read は replica へ自動振り分け */
const users = await prisma.user.findMany()

/** 強整合 read：直前の write を確実に読む / 残高チェックなど */
const fresh = await prisma.$primary().user.findUnique({ where: { id } })

/** $transaction 内は read も自動で primary */
await prisma.$transaction(async (tx) => {
  const account = await tx.account.findUnique({ where: { id } })  // primary
  await tx.account.update({ where: { id }, data: { balance: account.balance - 100 } })  // primary
})
```

Repository 層の規約：

- デフォルト（replica 許容）：`findById(id)` のように普通の名前で実装
- 強整合 read 必須：メソッド名末尾に `FromPrimary` を付ける（例：`findByIdFromPrimary`）。実装内で `prisma.$primary()` を使う

#### connection-string.ts

```typescript
const DEFAULT_URL = "postgresql://postgres:password@localhost:5432/typing_royale_dev"

export const buildConnectionString = (): string => {
  const baseUrl = process.env.DATABASE_URL ?? DEFAULT_URL
  const dbName = process.env.DB_NAME
  if (!dbName) return baseUrl
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}
```

env 検証パッケージ経由ではなく `process.env` を直接読む（理由：Prisma CLI 起動時など、app の env 検証を経由しない経路でも使われるため）。

#### マイグレーション / generate / seed のコマンド

`packages/db/package.json` の scripts に集約。

```json
{
  "scripts": {
    "build": "tsc",
    "db:generate": "prisma generate --config=prisma/prisma.config.ts",
    "db:migrate": "prisma migrate dev --config=prisma/prisma.config.ts",
    "db:migrate:deploy": "prisma migrate deploy --config=prisma/prisma.config.ts",
    "db:push": "prisma db push --config=prisma/prisma.config.ts",
    "db:seed": "prisma db seed --config=prisma/prisma.config.ts",
    "db:studio": "prisma studio --config=prisma/prisma.config.ts"
  }
}
```

generated client は turbo の `@repo/db#db:generate` タスク（build の `dependsOn`）で生成されるため、`postinstall` フックは置かない（CI / clone 直後でも `pnpm build` の依存解決で自動的に走る）。

`dotenvx` による env 復号化は **各 app の package.json で wrapper を書いて呼ぶ** 設計にする：

```jsonc
// apps/api/package.json
{
  "scripts": {
    "db:migrate": "dotenvx run -f .env.local -- pnpm --filter @repo/db db:migrate",
    "db:seed": "DB_NAME=typing_royale_dev dotenvx run -f .env.local -- pnpm --filter @repo/db db:seed"
  }
}
```

これにより `apps/api` 専用の env で migration / seed が走り、cron app などが将来独自の env で同じコマンドを叩けるようになる。

#### seed.ts の扱い

seed は **テスト初期化と開発環境のセットアップが目的** で、本番マスターデータは管理画面経由での登録を推奨する方針。そのため seed は **`packages/db/prisma/seed.ts` に一元化** する（app ごとに分けない）。

- 全 app (api / cron / worker) が同じ DB スキーマ・同じ dev データを共有するため、seed を共通化しても齟齬は出ない
- 既存の dev-login 用 dev ユーザー（alice / bob）や、将来追加される Memo / カテゴリ等のサンプルデータもすべてここに集約
- 起動コマンドは `pnpm --filter @repo/db db:seed`。各 app の `package.json` は dotenvx ラッパー (`dotenvx run -f .env.local -- pnpm --filter @repo/db db:seed`) だけを持つ
- `NODE_ENV === "production"` の場合は seed 自体をスキップする多重ガードを `seed.ts` 内に維持

### `@repo/logger` の設計

```
packages/logger/
├── package.json
├── tsconfig.json
├── eslint.config.js
└── src/
    ├── interface.ts            # ILogger / LogMetadata
    ├── context.ts              # AsyncLocalStorage の logContext
    ├── logger-factory.ts       # LoggerFactory + 既定 logger
    ├── console-logger.ts
    ├── pino-logger.ts
    ├── winston-logger.ts
    ├── silent-logger.ts
    └── index.ts                # re-export
```

ファイル構成は既存 `apps/api/src/log/` をほぼそのまま移設する。差分は以下：

- `LOGGER_TYPE` 定数は `apps/api/src/const` から `packages/logger/src/const.ts` に移設
- `LoggerFactory.getLogger()` は `process.env.LOGGER_TYPE` を直接読む（無ければ `pino` にフォールバック）。各 app の `src/env.ts` で `LOGGER_TYPE` を検証する責務は app 側に持たせる
- Express への依存は **元から無いはず** なので変更不要

#### context.ts と AsyncLocalStorage

リクエストスコープの `requestId` / `userId` を logger 出力に自動付与するための仕組み。Express の `app.use` でリクエストごとに `logContext.run(...)` を呼ぶ middleware は `apps/api` に残し、`@repo/logger` 側は AsyncLocalStorage の入れ物と取得関数のみを export する。

```typescript
// packages/logger/src/context.ts
import { AsyncLocalStorage } from "async_hooks"

export type LogContext = {
  requestId?: string
  userId?: number
}

export const logContext = new AsyncLocalStorage<LogContext>()
```

cron / worker では `logContext.run({ requestId: jobId }, async () => { /* ... */ })` のように、`requestId` フィールドに job 識別子を入れて使う（`LogContext` の型は `{ requestId?: string, userId?: number | string }` で job 専用フィールドは持たない）。

### `@repo/errors` の設計

```
packages/errors/
├── package.json
├── tsconfig.json
├── eslint.config.js
└── src/
    ├── result.ts               # Result<T> + ApiError + ヘルパ
    └── index.ts
```

中身は既存 `apps/api/src/types/result.ts` を 1 ファイルそのまま移設するだけ。

```typescript
export type ApiErrorType =
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNAUTHORIZED"

export type ApiError = {
  statusCode: number
  type: ApiErrorType
  message: string
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = (error: ApiError): Result<never> => ({ ok: false, error })

export const badRequestError = (message: string): ApiError => ({
  message,
  statusCode: 400,
  type: "BAD_REQUEST",
})

export const unauthorizedError = (message: string): ApiError => ({
  message,
  statusCode: 401,
  type: "UNAUTHORIZED",
})

export const forbiddenError = (message: string): ApiError => ({
  message,
  statusCode: 403,
  type: "FORBIDDEN",
})

export const notFoundError = (message: string): ApiError => ({
  message,
  statusCode: 404,
  type: "NOT_FOUND",
})

export const conflictError = (message: string): ApiError => ({
  message,
  statusCode: 409,
  type: "CONFLICT",
})
```

利用側は `import { Result, ok, err, notFoundError } from "@repo/errors"` のみで完結。

### env 検証方針（旧 `@repo/config` 廃止後）

歴史的経緯：当初は `@repo/config` パッケージで `baseEnvSchema` + `loadEnv()` を提供する設計だったが、2026-06-04 に **撤去** された。理由は以下：

- shared package を介すと「base + extend で組み立てる二段構え」になり、app の env スキーマを 1 ファイルで読みづらい
- DB / Redis / Logger の各 shared package が読む env は実体としては app の `process.env` であり、shared package で型を共有してもランタイムの参照経路は別になる
- 1 app = 1 env スキーマで完結する方が、デプロイユニットと env の対応が明示的

現在の方針：各 app の `src/env.ts` に **Zod スキーマと `safeParse → process.exit(1)` をインライン** で定義する。

```typescript
// apps/api/src/env.ts
import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  PORT: z.coerce.number().default(8080),
  JWT_SECRET: z.string().min(32),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.format())
  process.exit(1)
}
export const env = parsed.data
```

検証失敗時は **`process.exit(1)` でプロセスを即落とす**。env が壊れた状態で server が起動して実行時エラーになるよりは、起動時点で落として CI / 開発者に明示的に通知する方が安全。

`dotenvx` による暗号化 `.env.local` の読み込みは各 app の `package.json` の wrapper script で行う（`src/env.ts` は読み込み済みの `process.env` を検証するだけ）。

詳細は `step4-packages-config.md`（アーカイブ）の冒頭注記を参照。

### `@repo/redis` の設計

```
packages/redis/
├── package.json
├── tsconfig.json
├── eslint.config.js
└── src/
    ├── client.ts              # createRedisClient + デフォルト singleton
    └── index.ts               # client + ioredis 型 re-export
```

#### Redis クライアントの提供形態

**factory `createRedisClient` のみを export する**（`@repo/db` と同じ方針）。`packages/redis` 側に singleton を持たない。

```typescript
import Redis, { type RedisOptions } from "ioredis"

export type CreateRedisClientOptions = {
  url?: string
  options?: RedisOptions
}

export const createRedisClient = (params: CreateRedisClientOptions = {}): Redis => {
  if (params.url) return new Redis(params.url, params.options ?? {})
  const base = buildOptionsFromEnv()
  if (typeof base === "string") return new Redis(base, params.options ?? {})
  return new Redis({ ...base, ...params.options })
}
```

#### app 側の利用例

通常用途は singleton 的に 1 つ生成して Repository に DI：

```typescript
// apps/api/src/index.ts
import { createRedisClient } from "@repo/redis"

const redis = createRedisClient()
const refreshTokenRepository = new IoRedisRefreshTokenRepository(redis)

process.on("SIGTERM", async () => {
  await redis.quit()
})
```

BullMQ や Pub/Sub を後から入れる場合は **factory を複数回呼ぶだけ**：

```typescript
// apps/worker/src/index.ts
import { Queue, Worker, QueueEvents } from "bullmq"
import { createRedisClient } from "@repo/redis"

/** cache / 通常用途 */
const redis = createRedisClient()

/** BullMQ Queue / Worker 用（別接続必須、maxRetriesPerRequest: null は BullMQ の要件） */
const bullConnection = createRedisClient({
  options: { maxRetriesPerRequest: null },
})
const emailQueue = new Queue("email", { connection: bullConnection })

const emailWorker = new Worker(
  "email",
  async (job) => { /* ... */ },
  { connection: createRedisClient({ options: { maxRetriesPerRequest: null } }) },
)

/** Pub/Sub subscriber 用（subscribe するとこの接続は通常コマンド不可になるため別接続必須） */
const subscriber = createRedisClient()
await subscriber.subscribe("user-events")
subscriber.on("message", (channel, message) => { /* ... */ })
```

#### Repository 実装は packages に置かない

`IoRedisRefreshTokenRepository` のような **app 固有のキー設計 / TTL を含む Repository** は app 側に残す。`@repo/redis` は接続クライアントと型 re-export だけを責務とする（`@repo/db` が Prisma client だけを提供して Repository を app に残すのと同じ思想）。

既存の `apps/api/src/client/redis.ts` は step6 で削除し、`apps/api/src/index.ts` で `createRedisClient()` を呼ぶ形に統一する。

#### env 読み込みのフォールバック

既存 `apps/api` は `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` の 4 つを個別に読んでいる。`@repo/redis` では：

1. `REDIS_URL` が設定されていればそれを最優先
2. 無ければ既存の 4 つの個別 env から組み立て（後方互換）

新規 app では `REDIS_URL` 一本に統一する方針を各 app の `src/env.ts` の Zod スキーマで示唆する（`REDIS_HOST` / `REDIS_PORT` などは MVP 後の互換目的でのみ残す）。

### ビルド順序と Turborepo タスク

`turbo.json` の `build` / `dev` / `test` タスクは既に `dependsOn: ["^build"]` が入っているため、依存 packages から先にビルドされる。`@repo/db` だけは **`prisma generate` を build 前に走らせる必要がある** ため、専用タスクを追加する。

```jsonc
// turbo.json への追記
{
  "tasks": {
    "@repo/db#db:generate": {
      "cache": false,
      "inputs": ["prisma/schema.prisma"],
      "outputs": ["generated/**"]
    },
    "build": {
      "dependsOn": ["^build", "@repo/db#db:generate"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**", "build/**", "generated/**"]
    }
  }
}
```

これにより `pnpm build` を root で叩くと、`@repo/db` の generate → 全 packages の build → 全 apps の build の順で安全に実行される。

### 段階移行戦略

apps/api のコードと既存 spec / テストを壊さないよう、以下の順序で step を分けて移行する：

| step | 内容 | 完了時の状態 |
| --- | --- | --- |
| step1 | `packages/db` 新設 + Prisma schema/migrations/seed 移設。`packages/db` は **factory のみ export**。既存 `apps/api/src/prisma/prisma.client.ts` は **内部 singleton を持つ wrapper** に差し替えて互換維持 | api の既存 import (`import { prisma } from "../prisma/prisma.client"`) は wrapper 経由で動き続ける |
| step2 | `packages/logger` 新設 + 既存 log/ 移設 | api からは `@repo/logger` の `logger` を import 可能。既存 `apps/api/src/log/` は wrapper で互換維持 |
| step3 | `packages/errors` 新設 + Result 型移設 | api からは `@repo/errors` の `Result` を import 可能。既存 `apps/api/src/types/result.ts` は wrapper |
| step4 | （廃止）当初は `packages/config` を新設する step だったが、`@repo/config` 撤去（2026-06-04）に伴い無効化。`apps/api/src/env.ts` に Zod スキーマ + `safeParse → process.exit(1)` をインラインで定義する方式へ。詳細は `step4-packages-config.md` のアーカイブ冒頭注記 | apps/api/src/env.ts が自己完結で env を検証 |
| step5 | `packages/redis` 新設 + 既存 client/redis.ts 移設。**factory のみ export**。`apps/api/src/client/redis.ts` は内部 singleton を持つ wrapper に差し替え | api の既存 import (`import { redis } from "./client/redis"`) は wrapper 経由で動き続ける |
| step6 | `apps/api/src/index.ts` を **factory ベースの DI assembly** に書き換え + 全 import を `@repo/*` に置換 + 旧 wrapper / 旧ファイル削除 + テスト setup を factory ベースに更新 | apps/api 内部の singleton 完全消滅。client の生成・破棄が `src/index.ts` に集約される |

各 step は **単独で test:ci が緑**になることを必須にする。step6 完了までは「packages は factory のみ、apps/api 内部に singleton wrapper」という二重構造で互換性を保つ。

### MVP 対象外（将来検討）

以下は今回のスコープ外。必要になった時点で別 spec を切る。

- `packages/auth` — JWT 発行 / 検証ヘルパ（現在 `apps/api/src/lib/jwt.ts`）。cron が JWT を発行することは稀だが、検証は OAuth トークン管理系の cron で必要になり得る
- `apps/cron` / `apps/worker` のテンプレート実装 — 本 spec では packages の切り出しのみに集中する
- `@repo/logger-client` — フロント用 logger。Next.js の Sentry 連携などが具体化したら別パッケージとして切る
- `@repo/queue` — BullMQ などのジョブキュー抽象。`@repo/redis` をベースに、worker 実装が具体化した段階で検討

---

## 必要な画面

なし（インフラ／基盤の切り出しタスク）。

## 必要な API

なし（既存 API の挙動は変えない。import パスだけが変わる）。

## 必要な DB 設計

DB 設計の変更はなし。既存の `schema.prisma` をそのまま `packages/db/prisma/schema.prisma` に移設する。

参考までに、本 spec の初期設計時点のサンプルスキーマ（User / AuthAccount / Memo の 3 テーブル）：

```mermaid
erDiagram
    USERS ||--o{ AUTH_ACCOUNTS : has
    USERS {
        int id PK
        string email
        string name
        string avatarUrl
        datetime createdAt
        datetime updatedAt
    }
    AUTH_ACCOUNTS {
        int id PK
        int userId FK
        string provider
        string providerAccountId
        datetime createdAt
        datetime updatedAt
    }
    MEMOS {
        int id PK
        string title
        string body
        datetime createdAt
        datetime updatedAt
    }
```

> 注：上記は **本 spec の初期設計時点のサンプル**であり、現行 typing-royale の本番スキーマは PlaySession / Problem / CrawledRepo / Reward / BadgeConfig / Language / UserLifetimeStats / UserLanguageBest / MonthlyRankingSnapshot / RankingSnapshot 等を含む大規模なものに拡張されている。本 spec のスコープは「Prisma 関連を packages/db に移設する」であり、スキーマの詳細は範囲外。最新のスキーマ全体は [`packages/db/prisma/schema.prisma`](../../../packages/db/prisma/schema.prisma) を直接参照。

## フロー図

### 移行後の app 起動シーケンス（例：apps/api）

```mermaid
sequenceDiagram
    autonumber
    participant Boot as apps/api/src/index.ts
    participant ENV as ./env (inline zod)
    participant LOG as "@repo/logger"
    participant DB as "@repo/db"
    participant RDS as "@repo/redis"
    participant Repo as Repositories
    participant EXP as Express

    Boot->>ENV: import { env }
    ENV->>ENV: zod safeParse(process.env)<br/>失敗時 process.exit(1)
    ENV-->>Boot: env (型付き)
    Boot->>LOG: import { logger }
    LOG-->>Boot: logger (singleton)
    Boot->>DB: createPrismaClient()
    DB-->>Boot: prisma
    Boot->>RDS: createRedisClient()
    RDS-->>Boot: redis
    Boot->>Repo: new PrismaMemoRepository(prisma)
    Boot->>Repo: new IoRedisRefreshTokenRepository(redis)
    Boot->>EXP: app.listen(env.PORT)
    EXP-->>Boot: ready
    Boot->>LOG: logger.info("api started", { port })
    Note over Boot: process.on("SIGTERM", ...) で<br/>prisma.$disconnect() + redis.quit()
```

### 新規 app（cron）からの利用シーケンス

```mermaid
sequenceDiagram
    autonumber
    participant Cron as apps/cron/src/index.ts
    participant ENV as ./env (inline zod)
    participant LOG as "@repo/logger"
    participant DB as "@repo/db"
    participant RDS as "@repo/redis"
    participant PG as Postgres
    participant R as Redis

    Cron->>ENV: import { env }
    ENV-->>Cron: env
    Cron->>DB: createPrismaClient()
    DB-->>Cron: prisma
    Cron->>RDS: createRedisClient()
    RDS-->>Cron: redis
    Cron->>LOG: import { logger, logContext }
    Cron->>LOG: logContext.run({ requestId }, run)
    Note over Cron: run()
    Cron->>DB: prisma.user.count()
    DB->>PG: SELECT COUNT(*) FROM users
    PG-->>DB: 42
    DB-->>Cron: 42
    Cron->>RDS: redis.set("cron:last-count", 42, "EX", 3600)
    RDS->>R: SET cron:last-count 42 EX 3600
    R-->>RDS: OK
    Cron->>LOG: logger.info("user count cached", { count: 42 })
    Cron->>DB: prisma.$disconnect()
    Cron->>RDS: redis.quit()
```
