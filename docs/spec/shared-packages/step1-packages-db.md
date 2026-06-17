# step1-packages-db.md

`@repo/db` パッケージを新設し、Prisma schema / migrations / generated client / factory を `apps/api` から移設する。`packages/db` は **factory `createPrismaClient` のみを export** し、singleton は持たない。既存 `apps/api/src/prisma/prisma.client.ts` は **内部に singleton を持つ wrapper** に差し替えて既存 import (`import { prisma } from "../../prisma/prisma.client"`) を壊さず、step6 で wrapper 自体を削除する。

## 対応内容

### 1. ディレクトリ作成

```
packages/db/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── prisma/
│   ├── schema.prisma                # apps/api/src/prisma/schema.prisma を移動
│   ├── prisma.config.ts             # apps/api/src/prisma/prisma.config.ts を移動
│   ├── seed.ts                      # apps/api/src/prisma/seed.ts を移動（dev users + Language マスタ + ranking fixture 呼び出し）
│   ├── seed-ranking-fixtures.ts     # ローカル動作確認用のランキング fixture
│   └── migrations/                  # apps/api/src/prisma/migrations/ を全移動
├── src/
│   ├── client.ts                # createPrismaClient factory + 接続文字列ヘルパ
│   └── index.ts
└── generated/                   # prisma generate の出力先 (tracked)
```

### 2. `packages/db/package.json`

```json
{
  "name": "@repo/db",
  "version": "1.0.0",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "sideEffects": false,
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist generated",
    "dev": "tsc --watch",
    "db:generate": "prisma generate --config=prisma/prisma.config.ts",
    "db:migrate": "prisma migrate dev --config=prisma/prisma.config.ts",
    "db:migrate:deploy": "prisma migrate deploy --config=prisma/prisma.config.ts",
    "db:push": "prisma db push --config=prisma/prisma.config.ts",
    "db:seed": "prisma db seed --config=prisma/prisma.config.ts",
    "db:studio": "prisma studio --config=prisma/prisma.config.ts",
    "lint": "eslint 'src/**/*.ts'",
    "lint:fix": "eslint 'src/**/*.ts' --fix"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.7.0",
    "@prisma/client": "^7.2.0",
    "@prisma/extension-read-replicas": "^0.5.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:^",
    "@repo/typescript-config": "workspace:^",
    "@types/node": "^24.10.1",
    "eslint": "^9.39.1",
    "prisma": "^7.2.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

`main` / `types` は `dist/src/...` を指す（`tsconfig.json` の `rootDir: "."` + `include: ["src/**/*", "generated/**/*"]` の結果、`src/` 配下も `dist/src/...` 配下に出力されるため）。

`postinstall` フックは置かない（generated client は turbo の `@repo/db#db:generate` タスクで build 時に生成されるため）。

### 3. `packages/db/prisma/schema.prisma`

`apps/api/src/prisma/schema.prisma` を **そのまま** 移動。1 箇所だけ修正：

```diff
 generator client {
     provider     = "prisma-client"
-    output       = "./generated"
+    output       = "../generated"
     moduleFormat = "cjs"
 }
```

`output` は `prisma/` から見て `../generated` を指すため。

### 4. `packages/db/prisma/prisma.config.ts`

```typescript
import { defineConfig } from "prisma/config"

const DEFAULT_URL = "postgresql://postgres:password@localhost:5432/typing_royale_dev"

/**
 * DB_NAME 環境変数が設定されている場合、DATABASE_URL のDB名部分を置き換える
 * テスト実行時に DB_NAME=typing_royale_test を指定することで、
 * テスト用DBにマイグレーションを適用できる
 *
 * DATABASE_URL が未設定の場合はローカルのデフォルトを使う（prisma generate 時など）
 */
const getDatasourceUrl = (): string => {
  const baseUrl = process.env.DATABASE_URL ?? DEFAULT_URL
  const dbName = process.env.DB_NAME
  if (!dbName) return baseUrl
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}

export default defineConfig({
  datasource: {
    url: getDatasourceUrl(),
  },
  migrations: {
    path: "./migrations",
    seed: "npx tsx ./prisma/seed.ts",
  },
  schema: "./schema.prisma",
})
```

`env()` ヘルパは使わず `process.env.DATABASE_URL ?? DEFAULT_URL` のフォールバック付きにする。`prisma generate` などの CLI から呼ばれる経路では env が未読の状態で評価されるため、必ず DEFAULT_URL を返せる形にしておく。

### 5. `packages/db/prisma/seed.ts`

既存の `apps/api/src/prisma/seed.ts` を移設する。**seed は全 app 共通**で、本番マスターデータは管理画面経由で投入する方針。本プロジェクトの seed は以下を投入する：

- **言語マスタ (`Language`)**：production 含めて全環境で upsert（クローラ `apps/cron` が `slug` を Search API の `language:` フィルタに渡すため）
- **dev users (`User` + `AuthAccount(provider="dev")`)**：dev / test 環境のみ
- **ランキング fixture (`seedRankingFixtures`)**：dev / test 環境のみ（ローカル動作確認用に別ファイル `seed-ranking-fixtures.ts` から呼ぶ）

`@repo/db` 本体は factory のみを提供するが、`seed.ts` 自体は CLI スクリプトなので **`createPrismaClient` を 1 回呼んで 1 接続だけ使う**形にする。

```typescript
/* eslint-disable no-console */
import { createPrismaClient } from "../src/client"

import { seedRankingFixtures } from "./seed-ranking-fixtures"

const prisma = createPrismaClient()

/**
 * dev-login で使う開発用ユーザー
 * githubUsername で識別する（typing-royale は GitHub OAuth ベース）。
 */
type DevUserSeed = {
  githubUsername: string
  email: string
}

const devUsers: DevUserSeed[] = [
  { githubUsername: "alice", email: "alice@dev.local" },
  { githubUsername: "bob", email: "bob@dev.local" },
]

const seedDevUsers = async () => {
  for (const devUser of devUsers) {
    const user = await prisma.user.upsert({
      create: { githubUsername: devUser.githubUsername, email: devUser.email },
      update: { githubUsername: devUser.githubUsername },
      where: { email: devUser.email },
    })
    await prisma.authAccount.upsert({
      create: {
        provider: "dev",
        providerAccountId: devUser.email,
        userId: user.id,
      },
      update: {},
      where: {
        provider_providerAccountId: { provider: "dev", providerAccountId: devUser.email },
      },
    })
    console.log(`Seeded dev user: ${devUser.email} (id=${user.id})`)
  }
}

type LanguageSeed = { name: string, slug: string }

const languages: LanguageSeed[] = [
  { name: "TypeScript", slug: "typescript" },
  { name: "JavaScript", slug: "javascript" },
]

const seedLanguages = async () => {
  for (const lang of languages) {
    await prisma.language.upsert({
      create: { name: lang.name, slug: lang.slug },
      update: { name: lang.name },
      where: { slug: lang.slug },
    })
    console.log(`Seeded language: ${lang.slug}`)
  }
}

const main = async () => {
  /** languages は production でも投入（クローラの動作に必要） */
  await seedLanguages()
  if (process.env.NODE_ENV === "production") {
    console.log("Skip dev users seeding: NODE_ENV=production")
    return
  }
  await seedDevUsers()
  await seedRankingFixtures(prisma)
  console.log("Seed completed (PostgreSQL)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

**ポイント**：

- `import { createPrismaClient } from "../src/client"` で `@repo/db` 自身の factory を相対 import 経由で使う（workspace 依存を自分自身に向けるのを避ける）
- スクリプトトップで `const prisma = createPrismaClient()` を 1 回だけ呼ぶ
- 言語マスタは production でも必要、dev users / ranking fixture は dev / test のみという二段ガードを `main()` 内に持たせる
- `NODE_ENV === "production"` ガードで本番 DB への誤投入を防ぐ
- `seed-ranking-fixtures.ts` はローカルの「ランキング表示確認」用の fixture を別ファイル化したもの（seed.ts 本体を短く保つ）

### 6. `packages/db/src/client.ts`

**factory のみを提供** する。`packages/db` 側に singleton を持たない。各 app の `src/index.ts` で 1 回呼んで Repository に DI で渡す。接続文字列ヘルパ (DB_NAME 上書きロジック) もこのファイル内にまとめる（別ファイルに切る程の規模ではないため）。

```typescript
import { PrismaPg } from "@prisma/adapter-pg"
import { readReplicas } from "@prisma/extension-read-replicas"

import { PrismaClient } from "../generated/client"

const DEFAULT_URL = "postgresql://postgres:password@localhost:5432/typing_royale_dev"

/**
 * DATABASE_URL を取得しつつ、DB_NAME が指定されていれば DB 名部分を上書きする
 * テスト実行時の DB 切り替え（DB_NAME=typing_royale_test）に対応
 */
const buildConnectionString = (): string => {
  const baseUrl = process.env.DATABASE_URL ?? DEFAULT_URL
  const dbName = process.env.DB_NAME
  if (!dbName) return baseUrl
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}

export type CreatePrismaClientOptions = {
  /**
   * 接続文字列を明示指定する。省略時は process.env.DATABASE_URL (+ DB_NAME 上書き)
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
 *
 * read replica が設定されている場合は @prisma/extension-read-replicas で自動振り分け：
 *   - findMany / findUnique / count / aggregate などの read → replica
 *   - create / update / delete / $transaction / $executeRaw → primary
 * 強整合性が必要な read は (prisma as any).$primary().user.findUnique(...) で primary 強制可能
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

### 7. `packages/db/src/index.ts`

```typescript
export { createPrismaClient } from "./client"
export type { CreatePrismaClientOptions } from "./client"

/**
 * Prisma が生成するドメイン型を re-export
 * 利用側は import type { User, Memo } from "@repo/db" で参照できる
 */
export * from "../generated/client"
```

`prisma` singleton は **export しない**。各 app 側で `createPrismaClient()` を呼ぶ。

### 8. `packages/db/tsconfig.json`

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "generated/**/*"],
  "exclude": ["node_modules", "dist", "prisma"]
}
```

- `extends` は workspace 内の `@repo/typescript-config/base.json` を使う（composite / declaration / module 設定は base に集約）
- `rootDir: "."` にすることで `src/` と `generated/` の両方を含めて出力できる（結果として `dist/src/index.js`, `dist/generated/...` が生成される）
- `prisma/` は CLI 用設定 + seed スクリプトなのでビルド対象外

### 9. `packages/db/eslint.config.js`

`generated/` (prisma generate の出力) と `prisma/` (CLI 用設定) を lint 対象外にする。**generated は tracked** にしているため `.gitignore` への登録は不要（new clone でも generated 済み状態で動かしたいケース、CI でも generate が走るが念のため tracked を維持する選択）。

```javascript
const baseConfig = require("@repo/eslint-config")

module.exports = [
  ...baseConfig,
  {
    ignores: ["generated/**", "prisma/**"],
  },
]
```

### 11. `apps/api` 側の互換 wrapper

> **現在の状態**: step6 完了済みのため、`apps/api/src/prisma/prisma.client.ts` の wrapper は **既に削除されている**。`apps/api/src/prisma/` ディレクトリ自体が存在しない。step1 単独移行時は以下の wrapper を一時的に置いて互換維持していた（履歴記録）。

`apps/api/src/prisma/prisma.client.ts` を以下に差し替える。`@repo/db` は factory のみ提供なので、apps/api 内部で **暫定的に singleton を保持する** wrapper にして既存 import を壊さない。step6 でこの wrapper 自体を削除し、`src/index.ts` での DI assembly に置き換える。

```typescript
import { createPrismaClient } from "@repo/db"

/**
 * @deprecated step6 で削除予定。
 * 新規コードは src/index.ts で createPrismaClient() を呼び、
 * Repository に DI で渡すこと。
 */
export const prisma = createPrismaClient()
```

`apps/api/src/prisma/schema.prisma` / `migrations/` / `prisma.config.ts` / `seed.ts` / `generated/` は **物理的に packages/db へ移動**。step1 完了時点では `apps/api/src/prisma/` は `prisma.client.ts` のみ残る wrapper ディレクトリ、step6 完了時点では `apps/api/src/prisma/` 自体が削除済み。

### 12. `apps/api/package.json` の修正

```diff
 {
   "scripts": {
-    "db:generate": "dotenvx run -f .env.local -- prisma generate --config=src/prisma/prisma.config.ts",
-    "db:migrate": "dotenvx run -f .env.local -- prisma migrate dev --config=src/prisma/prisma.config.ts",
-    "db:migrate:deploy": "dotenvx run -f .env.local -- prisma migrate deploy --config=src/prisma/prisma.config.ts",
-    "db:push": "dotenvx run -f .env.local -- prisma db push --config=src/prisma/prisma.config.ts",
-    "db:seed": "dotenvx run -f .env.local -- prisma db seed --config=src/prisma/prisma.config.ts",
-    "db:studio": "dotenvx run -f .env.local -- prisma studio --config=src/prisma/prisma.config.ts",
+    "db:generate": "dotenvx run -f .env.local -- pnpm --filter @repo/db db:generate",
+    "db:migrate": "dotenvx run -f .env.local -- pnpm --filter @repo/db db:migrate",
+    "db:migrate:deploy": "dotenvx run -f .env.local -- pnpm --filter @repo/db db:migrate:deploy",
+    "db:push": "dotenvx run -f .env.local -- pnpm --filter @repo/db db:push",
+    "db:seed": "dotenvx run -f .env.local -- pnpm --filter @repo/db db:seed",
+    "db:studio": "dotenvx run -f .env.local -- pnpm --filter @repo/db db:studio",
   }
 }
```

apps/api は **dotenvx で .env.local を復号化して `pnpm --filter @repo/db db:*` に渡すラッパー** だけを持つ。seed の中身（dev-login 用 alice / bob 等）は `packages/db/prisma/seed.ts` に集約されているため、apps/api 側に seed スクリプトを置く必要はない。

```diff
   "dependencies": {
-    "@prisma/adapter-pg": "^7.7.0",
-    "@prisma/client": "^7.2.0",
+    "@repo/db": "workspace:^",
     "@repo/api-schema": "workspace:^",
```

```diff
   "devDependencies": {
-    "prisma": "^7.2.0",
```

`@prisma/*` / `prisma` 本体の依存は `@repo/db` 側に集約され、apps/api からは消える。

### 13. `turbo.json` への追記

```jsonc
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

## 動作確認

### 単体確認

```bash
# packages/db 単体でビルドできる
cd packages/db
pnpm install
pnpm db:generate
pnpm build

# generated client が出力されている
ls packages/db/generated/client/

# dist に re-export された型が出ている
test -f packages/db/dist/index.d.ts && echo OK
```

### apps/api 側の確認

```bash
# api ビルドが通る（@repo/db からの factory import が解決される）
cd apps/api
pnpm build

# 既存の互換 wrapper (内部で createPrismaClient を呼んで singleton 化) 経由で動く
node -e "const { prisma } = require('./dist/prisma/prisma.client'); console.log(typeof prisma.user.findMany)"
```

### migration / seed の動作

```bash
# api 側の wrapper コマンドから migration が走る（実体は @repo/db の prisma migrate）
cd apps/api
pnpm db:migrate:deploy

# seed が @repo/db の seed.ts から実行される（apps/api 側はラッパーだけ）
pnpm db:seed

# alice / bob が投入されている
pnpm db:studio
```

### テスト

```bash
# apps/api の既存テスト（service / controller）が全て通る
cd apps/api
pnpm test:ci
```

**ゴール**: この step 完了時点で、`apps/api` の既存テストが緑のまま、Prisma 関連のファイルが `packages/db` に物理的に移動している状態。`@repo/db` は **factory のみ export**、`apps/api/src/prisma/prisma.client.ts` は **`createPrismaClient()` を呼んで singleton 化する暫定 wrapper** になる。step6 でこの wrapper も削除して `apps/api/src/index.ts` に DI assembly を集約する。
