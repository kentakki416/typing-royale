# API Server

Express.js + TypeScript による API サーバー

## プロジェクト概要

レイヤードアーキテクチャに基づいた REST API サーバー。Prisma による型安全なデータアクセス、依存性注入による疎結合な設計を採用。

## セットアップ

API を初めて触る人 / 新しい環境で初回起動するときの手順。実装ルールやテスト戦略は本 README の後半 + `CLAUDE.md` を参照。

### 目次

- [ローカル開発（初回セットアップ）](#ローカル開発初回セットアップ)
- [AWS デプロイ後のセットアップ](#aws-デプロイ後のセットアップ)
- [マイグレーションを追加するとき](#マイグレーションを追加するとき)
- [トラブルシューティング](#トラブルシューティング)

### ローカル開発（初回セットアップ）

#### 1. `.env.keys` を配置

`.env.local` は [dotenvx](https://dotenvx.com/) で暗号化されている。復号鍵 `.env.keys` を管理者から受け取り、**プロジェクトルート**（`<project-root>/.env.keys`）に配置する。`apps/api/.env.keys` はルートへのシンボリックリンクが git に含まれているため、ルートに置くだけで API からも参照される。

詳細は [ルート README の「環境変数の設定」](../../README.md#2-環境変数の設定) を参照。

#### 2. Docker Compose で Postgres / Redis を起動

プロジェクトルートで:

```bash
docker compose up -d
docker compose ps                    # postgres / redis が healthy なら OK
```

これで以下が起動する:

- Postgres 16（port 5432、初期 DB 名 `typing_royale_dev`、`postgres` / `password`）
- Redis 7（port 6379、AOF 永続化）

#### 3. 依存パッケージのインストールと共通スキーマのビルド

```bash
pnpm install                          # ルートで実行
pnpm --filter @repo/schema build      # スキーマは依存より先にビルドが必要
```

#### 4. Prisma クライアント生成 + マイグレーション適用

```bash
cd apps/api
pnpm db:generate                      # Prisma Client を生成
pnpm db:migrate                       # 既存のマイグレーションを dev DB に適用 + 新規があればプロンプト
```

> 既存マイグレーションのみ適用したい場合（CI など、新規マイグレーションのプロンプトを出さない）は `pnpm db:migrate:deploy` を使う。

#### 5. シードデータ投入（任意）

```bash
pnpm db:seed                          # dev 用テストユーザー (Alice / Bob) などを投入
```

#### 6. dev サーバー起動

```bash
pnpm dev                              # tsx watch で 8080 ポートで起動
curl http://localhost:8080/api/health # → {"status":"ok"} が返れば OK
```

#### 7. テスト用 DB を作って vitest を流す（テストを書く人向け）

`pnpm test` は内部で `DB_NAME=typing_royale_test` に切り替えて `db:migrate:deploy` を流すため、テスト用 DB を別途用意しなくても初回実行時に自動で作成される。

```bash
pnpm test                             # 全テスト
pnpm test test/service                # ユニットテストのみ（DB 不要）
pnpm test test/controller             # インテグレーションテスト（DB / Redis 必要）
```

### AWS デプロイ後のセットアップ

AWS インフラ自体のデプロイ手順は [`infra/README.md`](../../infra/README.md) を参照。Terraform apply 完了後、API 側で以下のセットアップが必要になる。

#### 1. Secrets Manager に環境変数を投入

Terraform は Secrets Manager の **箱** (`/typing-royale-<env>/app`) と JWT 鍵だけを作る。`DATABASE_URL` / `REDIS_HOST` / `GOOGLE_*` などは `scripts/seed-secrets.sh` で手動投入する:

```bash
# scripts/README.md の手順に従って事前に環境変数を export してから
npx dotenvx run -f apps/api/.env.local -- ./scripts/seed-secrets.sh dev
# prd の場合
npx dotenvx run -f apps/api/.env.local -- ./scripts/seed-secrets.sh prd
```

詳細は [`scripts/README.md`](../../scripts/README.md) を参照。

> **prd の `REDIS_HOST` は必ず `rediss://...`（TLS）にすること**。Terraform で `transit_encryption_enabled=true` にしているため、`redis://` だと接続失敗する。

#### 2. ECR に初回 Docker イメージを push

dev: `.github/workflows/deploy-aws-dev.yml` の workflow_dispatch で API / worker / migration の 3 イメージを ECR に push する。prd 用は dev workflow を複製して環境変数だけ書き換える。

#### 3. Prisma migration を ECS 上で実行

ECS Task Definition `typing-royale-<env>-migration` を one-shot で起動して `prisma migrate deploy` を流す。これは `migration` 専用 ECR (`typing-royale-migration`) のイメージから起動され、`apps/api/Dockerfile.migration` の `CMD` で `prisma migrate deploy --schema=prisma/schema.prisma` が走る。

```bash
# dev の場合
aws ecs run-task \
  --cluster typing-royale-dev-cluster \
  --task-definition typing-royale-dev-migration \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<private-subnet-id>],securityGroups=[<ecs-sg-id>]}"

# 完了したら CloudWatch Logs `/ecs/typing-royale-dev-migration` を確認
```

> `deploy-aws-dev.yml` は image build → migration task 起動 → API/worker service deploy を一気通貫で実行する。手動 RunTask は trouble shooting のとき限定。

#### 4. API service のデプロイ

dev と prd でデプロイ戦略が違うので注意。

| 環境 | 戦略 | 概要 |
|---|---|---|
| `dev` | **ローリングデプロイ** | `deploy-aws-dev.yml` が `aws-actions/amazon-ecs-deploy-task-definition` を `wait-for-service-stability=true` で実行し、完走まで待つ。承認ゲート・bake time なし |
| `prd` | **Blue/Green デプロイ** | ECS Native Blue/Green。target group A (Blue, current) → B (Green, new) に新 image を起動し、test listener (ALB port 9000) で事前確認 → bake time 10 分 → `prd` Environment の Required reviewers が承認すると production traffic shift |

apply 直後の初回は `desired_count` が 1（dev）/ 2（prd）に設定されているので、image push + Service 更新で task が起動する。インフラ側の設定差分は [`infra/README.md` のデプロイ戦略](../../infra/README.md#デプロイ戦略devprd-の違い) を参照。

### マイグレーションを追加するとき

```bash
cd apps/api
pnpm db:migrate                       # 対話的に migration 名を聞かれる → 例: add_user_table
```

これで `packages/db/prisma/migrations/<timestamp>_add_user_table/` が生成される。**git にコミットすること**（ECS migration task が apply するため）。

prd への適用は AWS デプロイフローに含まれる（ECS RunTask で `prisma migrate deploy` が流れる）。

### トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `dotenvx` で `.env.local` 復号失敗 | `.env.keys` がプロジェクトルートに無い、またはシンボリックリンクが壊れている | ルートに `.env.keys` を配置、`ls -l apps/api/.env.keys` でリンクを確認、必要なら `ln -sf ../../.env.keys apps/api/.env.keys` で再作成 |
| `db:migrate` で `P1001: Can't reach database server` | Postgres コンテナが起動していない / 別ポートを使っている | `docker compose ps` で postgres が healthy か確認、port 5432 を別プロセスが占有していないか `lsof -i :5432` で確認 |
| `db:migrate` で `P3009: migrate found failed migrations` | 過去のマイグレーションが途中で失敗して `_prisma_migrations` テーブルに `failed` のエントリが残っている | `pnpm db:push --force-reset` で dev DB を破棄して再構築（dev DB のデータは消える）。本番では絶対に使わない |
| `pnpm test` で `relation "user" does not exist` | テスト用 DB (`typing_royale_test`) にマイグレーションが当たっていない | `DB_NAME=typing_royale_test pnpm db:migrate:deploy` を手動で流す、または `pnpm test` を一度走らせて自動セットアップさせる |
| Redis 接続エラー | Redis コンテナが起動していない / `.env.local` の `REDIS_*` が間違っている | `docker compose ps` で redis 確認、`npx dotenvx get REDIS_HOST -f apps/api/.env.local` で値確認 |
| ECS migration task が `ImagePullBackoff` 相当の起動失敗 | ECR に migration image が push されていない | `.github/workflows/deploy-aws-dev.yml` の `build-push-migration` job を先に走らせる |
| dev サーバーが起動するが `/api/health` が `database: error` を返す | `DATABASE_URL` が空 or 間違っている、または Prisma Client 未生成 | `pnpm db:generate` を実行、`.env.local` の `DATABASE_URL` を確認 |

## ディレクトリ構成

```
apps/api/
├── src/
│   ├── index.ts                         # エントリーポイント（DI、サーバー起動）
│   ├── client/                          # 外部APIクライアント（OAuth等）
│   ├── const/                           # 定数定義
│   ├── controller/                      # リクエスト/レスポンスハンドリング
│   │   └── auth/                        # 認証関連のコントローラー
│   ├── lib/                             # ユーティリティ（JWT等）
│   ├── log/                             # ロギング設定
│   ├── middleware/                      # 共通ミドルウェア
│   ├── prisma/                          # Prisma設定、マイグレーション
│   ├── repository/prisma/               # データアクセス層（Prisma）
│   │   └── aggregate/                   # 複数テーブルを跨ぐ操作
│   ├── routes/                          # ルーティング定義
│   ├── service/                         # ビジネスロジック（関数型）
│   └── types/                           # 型定義
│       └── domain/                      # ドメインモデルの型定義
├── .env.local                           # 環境変数
├── package.json
└── tsconfig.json
```

## 設計思想

### 依存方向

- レイヤードアーキテクチャを意識して、メインのアプリケーションロジックであるservice層がDBや外部ライブラリ等の詳細を知らなくて良いようにinterfaceを使用する。

### Interfaceの利用

- 引数やレスポンスにはアプリケーションの型を利用する（外部パッケージの型を変換して扱う）

### 関数型のService 層

- Service層はクラスベースではなく関数ベースにした理由
    1. クラスのDI・インスタンス化がめんどくさい
    2. controllerのテストはインテグレーションテストを想定しているためserviceのモックなどはしない
    3. クラスベースでの状態管理（プライベート引数等）を使用するケースが少ない
- Controller から必要な Repository/Client を引数として受け取る

### ドメインモデル

- types/domainにドメインモデルの型だけ定義している。
- 実装はドメインロジックが必要になるまでしない（おそらく必要になるケースが少ないので対応しない）
- Repository層でPrisma -> ドメインモデル型に変化することでInterfaceを差し替え可能なものにしている
- ビジネス上の区分・列挙型もここに定義する（例: `RegistrationPeriod`）
- Repository / Service は `types/domain` から型をインポートする（`@repo/api-schema` には依存しない）

### Repository 層の責務

- Repository層の責務はデータストアへのアクセスおよび操作を抽象化させるだけにとどめる
- Repository層にトランザクションのまとまりや、キャッシュからのDBへのフォールバックなどをまとめない
  - 理由
    - どのコレクションにトランザクションで保存するかはドメインロジックに紐づく
    - キャッシュやキューを利用するかどうかは非機能要件が影響しており、ドメインよりの都合
    - ドメインロジックの大半はデータの取得結果や更新結果によって、ハンドリングを行うがその詳細がRepository層にあると、ドメイン層が何をやっているのか分かりづらい
- 逆にservice層にはredisやpostgresといった技術的な内容は出ないように閉じ込める（BeginやNXなどのオプションも）

## エラーハンドリング（Result 型）

Service 層は **業務エラー（4xx 系で返すべきエラー）は `Result<T>` で返却し、想定外の例外（DB 障害等）は throw** する。Controller は Result を `sendError` ヘルパ経由で返し、想定外エラーは想定外例外ハンドラが 500 で処理する。

### 経路と責務

| 経路 | 例 | ログ | ステータス |
|---|---|---|---|
| Service の `Result.err` | NotFound / Conflict / Unauthorized 等 | `sendError` が `logger.warn` | `result.error.statusCode`（4xx）|
| ルート内の throw（想定外） | DB 障害 / Prisma 例外 | `unhandledExceptionHandler` が `logger.error` + スタック | 500 |
| リクエストスキーマ違反 | `RequestSchemaMismatchError` | `unhandledExceptionHandler` が `logger.warn` | 400 |
| レスポンススキーマ違反 | `ResponseSchemaMismatchError` | `unhandledExceptionHandler` が `logger.error` | 500 |
| アクセスログ | 全リクエスト | `requestLogger` が `info` / `warn` | - |

### 設計方針

- **業務エラーを例外にしない**: Service が `throw` するのは「想定外」のみ。業務上想定されるエラー（バリデーション、重複、NotFound 等）は戻り値で表現する
- **呼び出し側で型安全に扱える**: `Result<T>` を返すことで、呼び出し側（Controller や他 Service）は ok/err を型で判別して分岐できる
- **Controller は `sendError` ヘルパ経由で返却**: `statusCode` と `message` をそのまま HTTP レスポンスに変換する。再解釈が必要な場合のみ Controller で変換
- **予期しない例外は想定外例外ハンドラに委譲**: Controller で try-catch は書かない（リダイレクトなど UX 上 JSON を返せない特殊ケース・副次処理の意図的握りつぶし・エラーを値に変換する場合は例外）

### Result 型の定義（`src/types/result.ts`）

```typescript
export type ApiError = {
  statusCode: number
  type: "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED"
  message: string
}

export type Result<T> =
  | { ok: true; value: T }
  | { error: ApiError; ok: false }
```

### ヘルパー関数

```typescript
import { ok, err, notFoundError, conflictError, badRequestError } from "../types/result"

return ok(user)                                              // 成功
return err(notFoundError("User not found"))                  // 404
return err(conflictError("Same file already uploaded"))      // 409
return err(badRequestError("Invalid category_id"))           // 400
```

### Service 実装ルール

- **戻り値は必ず `Promise<Result<T>>`**（`Promise<T>` や `Promise<T | null>` は使わない）
- **業務エラー**: `return err(notFoundError(...))` のように Result で返却
- **想定外エラー**: DB 呼び出し等で throw される例外はそのまま伝播させる（catch しない）

```typescript
export const createMemo = async (
  data: CreateMemoInput,
  memoRepository: MemoRepository
): Promise<Result<Memo>> => {
  const existing = await memoRepository.findByTitle(data.title)
  if (existing) {
    return err(conflictError("Same title already exists"))  // 業務エラー
  }
  const memo = await memoRepository.create(data)            // DB 障害時は throw（catch しない）
  return ok(memo)
}
```

### Controller 実装ルール

- **try-catch は書かない**（google-callback のようなリダイレクト分岐が必要な特殊ケースを除く）。Service が `throw` した想定外エラーは想定外例外ハンドラが 500 で返却する
- **Service の `Result` は `sendError` ヘルパ経由で返却する（必須）**:

```typescript
import { sendError } from "../../lib/send-error"

async execute(req: Request, res: Response) {
  const { id } = parseRequest(deleteMemoPathParamSchema, req.params)

  const result = await service.memo.deleteMemo(id, { memoRepository: this.memoRepository })

  if (!result.ok) {
    return sendError(req, res, result.error)
  }

  const response = parseResponse(deleteMemoResponseSchema, { message: "OK" })
  return res.status(200).json(response)
}
```

### sendError ヘルパ（`src/lib/send-error.ts`）

Controller で `Result.err` を HTTP レスポンスとして返却する共通関数。inline で `res.status().json()` を直接書くと業務エラーログが漏れるため、`if (!result.ok)` ブロックは必ずこのヘルパ経由で返却する。

- 内部で `logger.warn("API business error", { method, path, statusCode, type })` を出す
- `ErrorResponse` スキーマで JSON を組み立てて返す
- throw しないため、想定外例外ハンドラは通らない（業務エラーと想定外例外を経路レベルで分離）

### 想定外例外ハンドラ（`src/middleware/unhandled-exception-handler.ts`）

すべてのルート登録後に `app.use(unhandledExceptionHandler)` で登録される。**業務 4xx エラー（`Result.err`）は `sendError` 経由で返却されるため、このハンドラは通らない**。

- **`RequestSchemaMismatchError`** → 400 "Invalid request"（クライアント入力不正、`logger.warn`）
- **`ResponseSchemaMismatchError`** → 500 "Internal Server Error"（サーバ起因の契約違反、`logger.error`）
- **その他の throw** → 500 "Internal Server Error"（DB 障害等の想定外エラー、`logger.error` + スタック）

### 例外的に try/catch を許容するケース

「Controller / Service で try-catch は書かない」は **想定外エラーを catch するな**（throw 伝播を壊すな）という意味であり、以下 2 ケースは局所 try/catch を許容する:

| ケース | 例 | 扱い |
|---|---|---|
| **副次処理の意図的握りつぶし** | `finishSession` の達成カード PNG 生成失敗（カード生成失敗で /finish 全体を失敗扱いにしたくない） | `try { ... } catch (err) { logger.warn(...) }` の後そのまま処理を続行。**catch 内で再 throw しない** |
| **エラーを値に変換する必要** | `health-service` のサービスチェック（個別失敗を `status: "error"` に集約して両方の status を必ず返す） | `try { ... } catch (err) { return { status: "error", ... } }` |


## テスト戦略

### 基本方針

- **Service層 → ユニットテスト**: DB不要、高速、並列実行可能
- **Controller層 → インテグレーションテスト**（`apps/api/test/controller/`）: 自前インフラ（Postgres・Redis）は本物を使い必ず実データを検証する。`supertest` で HTTP レイヤーから検証

### テストランナー（Vitest）

本プロジェクトのテストは [Vitest](https://vitest.dev/)（Jest からの全面移行済み）で実行する。

- 設定ファイル: `apps/api/vitest.config.ts`
- セットアップ: `apps/api/test/vitest.setup.ts`（環境変数の初期化）
- `globals: true` を有効化しているため、`describe` / `it` / `expect` / `beforeEach` / `vi` などは import 不要でグローバル参照できる
- 実 DB を共有する Controller テストの競合を避けるため、`fileParallelism: false` で直列実行（旧 Jest 設定の `maxWorkers: 1` と同等）

### ユニットテスト（Service）

Service のユニットテストは以下の3原則を守る。

1. **変更に強い**: 入出力が変わらない限りテストも成功する
2. **すぐにテストできる**: 準備や実行順序に縛られない
3. **並列実行可能**: 他のテストと独立して実行できる

#### mockの方針

- **デフォルトは `vi.fn()` を使用する**。interface に基づいたオブジェクトを `vi.fn()` で作成し、引数として渡す
- **自作 Fake（例: `InMemoryXxxRepository`）は、テスト内で状態の読み書きが複数回絡む場合のみ検討する**。通常のserviceテストでは不要

```typescript
// 基本パターン: vi.fn() でmockを作成し、引数で渡す
const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()
const mockUserRepository = {
  findById: mockFindById,
}

mockFindById.mockResolvedValue(mockUser)
const result = await getUserById(1, { userRepository: mockUserRepository })
```

#### `vi.fn()` と `vi.mock()` の使い分け

| 方法 | 対象 | テストへの影響 | 本プロジェクトでの方針 |
|---|---|---|---|
| `vi.fn()` | 単一の関数。変数に代入して引数経由で渡す | import パスに依存しない。リファクタリング耐性が高い | **推奨** |
| `vi.mock()` | モジュール全体。`import` の解決自体を差し替える | テストがモジュールのファイルパスに結合する。リファクタリング耐性が低い | **非推奨** |

**本プロジェクトでは Service 層の全ての外部依存を引数（DI）で受け取る設計のため、`vi.mock()` は原則使用しない。**

`vi.mock()` はテスト対象が直接 `import` している内部モジュールを差し替える仕組みであり、テストがファイルパスという実装の詳細に依存する。依存を引数で渡す設計にすれば `vi.fn()` だけでテストが完結し、ファイル移動やリネーム時にテストが壊れない。

参考: [Vitest公式 - Mock Functions](https://vitest.dev/api/mock.html)

#### テストケースの観点

- 正常系（期待通りの入力 → `ok: true` で期待通りの値）
- 異常系（業務エラー → `ok: false` で `type` / `statusCode` / `message` を検証）
- 予期しないエラー（DB 障害等の throw → `rejects.toThrow(...)`）
- 依存の呼び出し検証（正しい引数で呼ばれたか）

#### テストケースの分類（必須）

`describe` を入れ子にして **「正常系」「異常系」で必ず分類する**。トップレベルの `describe` はテスト対象（関数名 / エンドポイント）にし、その直下に `describe("正常系", ...)` と `describe("異常系", ...)` を置く。

| 分類 | 対象 |
|---|---|
| **正常系** | 入力が正しく、期待通りに処理が成功するケース。Service なら `ok: true`、Controller なら 2xx を返すケース全般 |
| **異常系** | 業務エラー（4xx 系）、バリデーションエラー、想定外の例外（DB 障害等）、境界値で除外されるケースなど、正常系以外すべて |

```typescript
describe("getMemoById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("メモが存在する場合、ok: true とメモを返す", async () => {
      /** ... */
    })
  })

  describe("異常系", () => {
    it("メモが存在しない場合、ok: false と NOT_FOUND エラーを返す", async () => {
      /** ... */
    })

    it("DB 障害時にエラーをスローする", async () => {
      /** ... */
    })
  })
})
```

詳細なルールと Controller インテグレーションテストの例は `CLAUDE.md` の「テストケースの分類ルール」を参照。

#### Result 型のアサーション

Service は `Result<T>` を返すため、ok 判定で分岐してから値・エラーを検証する。

```typescript
// 成功時
const result = await getMemoById(1, mockMemoRepository)
expect(result.ok).toBe(true)
if (result.ok) {
  expect(result.value).toEqual(mockMemo)
}

// 業務エラー時
const result = await getMemoById(999, mockMemoRepository)
expect(result.ok).toBe(false)
if (!result.ok) {
  expect(result.error.type).toBe("NOT_FOUND")
  expect(result.error.statusCode).toBe(404)
  expect(result.error.message).toBe("Memo not found")  // Service 層のエラーメッセージは実装と一致
}

// 想定外の throw
mockFindById.mockRejectedValue(new Error("Database connection failed"))
await expect(getMemoById(1, mockMemoRepository)).rejects.toThrow("Database connection failed")
```

### インテグレーションテスト（Controller）

ユニットテストで検証できない以下の項目をテストする。

- **controllerが返すレスポンスの全パターン**: 正常系・異常系のHTTPステータスコードとレスポンスボディの存在
- **最終的なDBの状態**: データの作成・更新・削除が正しく反映されているか

※ 認証ミドルウェア単体のテストやリクエストバリデーション単体のテストは行わない。あくまでcontrollerのレスポンスパターンを網羅することで、これらも含めて検証する。

#### アサーションの方針

- **ステータスコードとレスポンスボディはオブジェクト一括（`toEqual` / `toMatchObject`）で検証する**。フィールドごとの個別 assertion は冗長でスキーマ変更の検出漏れを招く
- **エラーメッセージの文字列は検証しない**。メッセージはユーザー向け表記の微調整で変わり得るため、`expect.any(String)` で型のみ確認する

##### 推奨指針

| 対象 | 推奨マッチャー | 理由 |
|---|---|---|
| API レスポンス（外部契約） | **`toEqual`** + `expect.any(...)` | スキーマ変更の検出が重要（フィールド増減で必ず落ちる方が望ましい） |
| DB 行（内部状態） | **`toMatchObject`** | id / timestamp は内部詳細なので省略 OK |
| Redis / 単一値 | `toBe` のまま | 1値なので一括にする意味がない |

```typescript
// ❌ 悪い例: フィールドごとの個別 assertion
expect(res.status).toBe(200)
expect(res.body.id).toBe(user.id)
expect(res.body.email).toBe("test@example.com")

// ✅ 良い例: API レスポンスは toEqual で完全一致
expect(res.status).toBe(200)
expect(res.body).toEqual({
  created_at: expect.any(String),
  email: "test@example.com",
  id: user.id,
  name: "Test User",
})

// ✅ 良い例: DB 行は toMatchObject で内部詳細を省略
const createdUser = await testPrisma.user.findUnique({ where: { email: "new@example.com" } })
expect(createdUser).toMatchObject({
  email: "new@example.com",
  name: "New User",
})

// ✅ 良い例: エラーレスポンスも完全契約で検証（文言は any）
expect(res.status).toBe(404)
expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
```

#### 想定外例外ハンドラの適用

`attachUnhandledExceptionHandler(app)` をルート登録後に必ず呼び出し、本番同様に ZodError を 400、想定外 throw を 500 に変換する状態でテストする。

```typescript
const app = createTestApp()
app.use("/api/memo", memoRouter({ detail: new MemoDetailController(memoRepository) }))
attachUnhandledExceptionHandler(app)  // ルート登録後に呼び出すこと
```

#### テスト用DB

- 開発用と同じDBコンテナ内にテスト用データベースを作成する（コンテナを分けない）
- インテグレーションテストはドメイン単位でデータベースを分割可能にし、並列実行やCI での分割実行に対応する
- 各テストケースの `beforeEach` / `afterEach` で初期データの投入とクリーンアップを必ず行い、テスト間の独立性を保証する

#### テストの実行

```bash
# ユニットテストのみ（DB不要）
pnpm test test/service

# インテグレーションテストのみ（DB必要）
pnpm test test/controller

# 全テスト
pnpm test

# watch モード（変更ファイルだけ再実行）
pnpm test:watch

# カバレッジ計測（V8 ベース、coverage/ に出力）
pnpm test:coverage
```

## 開発コマンド

```bash
# 開発サーバー起動（ホットリロード）
pnpm dev

# ビルド
pnpm build

# 本番サーバー起動
pnpm start

# リント
pnpm lint
pnpm lint:fix
```

## Prisma コマンド

スキーマは `packages/db/prisma/schema.prisma` に集約されており、コマンドは `apps/api` 側のスクリプトから `pnpm --filter @repo/db ...` で呼び出す形になっている。すべて dotenvx 経由で `.env.local` の `DATABASE_URL` を解決する。

```bash
# マイグレーションの作成・適用（dev 用、対話的に migration 名を聞かれる）
pnpm db:migrate

# 既存マイグレーションの適用のみ（CI / 本番用）
pnpm db:migrate:deploy

# クライアントの生成
pnpm db:generate

# シードの実行
pnpm db:seed

# 開発用 GUI (Prisma Studio) の起動
pnpm db:studio
```

セットアップフローでの使い方は [セットアップ](#セットアップ) を参照。
