# step4-packages-config.md

`@repo/config` パッケージを新設し、`process.env` を Zod スキーマで検証する `loadEnv` ヘルパと、共通環境変数の `baseEnvSchema` を提供する。`apps/api` 側に `src/env.ts` を新設し、起動時に env 検証を行う。

## 対応内容

### 1. ディレクトリ作成

```
packages/config/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .gitignore
└── src/
    ├── base-schema.ts
    ├── load-env.ts
    └── index.ts
```

### 2. `packages/config/package.json`

```json
{
  "name": "@repo/config",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "dev": "tsc --watch",
    "lint": "eslint 'src/**/*.ts'",
    "lint:fix": "eslint 'src/**/*.ts' --fix"
  },
  "dependencies": {
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "@typescript-eslint/eslint-plugin": "^8.46.4",
    "@typescript-eslint/parser": "^8.46.4",
    "eslint": "^9.39.1",
    "typescript": "^5.9.3"
  }
}
```

### 3. `packages/config/src/base-schema.ts`

すべての server-side app が共通で必要とする env 変数のスキーマ片。

```typescript
import { z } from "zod"

/**
 * すべての server-side app で共通で必要な環境変数のスキーマ
 * 各 app は baseEnvSchema.extend({ ... }) で app 固有の env を追加する
 */
export const baseEnvSchema = z.object({
  /**
   * 実行環境
   */
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * Postgres 接続文字列
   * 例: postgresql://user:pass@host:5432/db
   */
  DATABASE_URL: z.string().url(),

  /**
   * ログレベル
   */
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /**
   * Logger 実装の種別
   * pino: 本番向け JSON 構造化ログ（推奨）
   * winston: 既存互換
   * console: ローカル開発向け
   * silent: テスト向け（出力なし）
   */
  LOGGER_TYPE: z.enum(["pino", "winston", "console", "silent"]).default("pino"),
})

export type BaseEnv = z.infer<typeof baseEnvSchema>
```

### 4. `packages/config/src/load-env.ts`

```typescript
import type { ZodSchema, z as zType } from "zod"

/**
 * process.env を Zod スキーマで検証して型付きオブジェクトを返す
 * 検証失敗時は stderr にエラーを出力して process.exit(1) で停止する
 *
 * @example
 * const env = loadEnv(z.object({ PORT: z.coerce.number() }))
 * env.PORT // number 型
 */
export const loadEnv = <T extends ZodSchema>(schema: T): zType.infer<T> => {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    console.error("❌ Invalid environment variables:")
    console.error(JSON.stringify(result.error.format(), null, 2))
    process.exit(1)
  }
  return result.data
}
```

### 5. `packages/config/src/index.ts`

```typescript
export { baseEnvSchema } from "./base-schema"
export type { BaseEnv } from "./base-schema"
export { loadEnv } from "./load-env"
```

### 6. `packages/config/tsconfig.json` / `.gitignore` / `eslint.config.js`

step1〜3 と同様の構成。

### 7. `apps/api/src/env.ts` を新設

```typescript
import { baseEnvSchema, loadEnv } from "@repo/config"
import { z } from "zod"

/**
 * apps/api の環境変数スキーマ
 * baseEnvSchema を継承し、API 固有の env を追加する
 */
const apiEnvSchema = baseEnvSchema.extend({
  /**
   * Express サーバーの待受ポート
   */
  PORT: z.coerce.number().default(8080),

  /**
   * JWT 署名鍵（最低 32 文字）
   */
  JWT_SECRET: z.string().min(32),

  /**
   * Google OAuth クライアント ID
   */
  GOOGLE_CLIENT_ID: z.string(),

  /**
   * Google OAuth クライアントシークレット
   */
  GOOGLE_CLIENT_SECRET: z.string(),

  /**
   * Redis 接続 URL（refresh token 保存用）
   */
  REDIS_URL: z.string().url(),

  /**
   * Admin API のダミーモード（DB 不要で固定データを返す）
   */
  ADMIN_USE_DUMMY: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
})

/**
 * 起動時に検証済みの型付き env
 * 不正な env の場合は import 時点で process.exit(1) する
 */
export const env = loadEnv(apiEnvSchema)

export type ApiEnv = typeof env
```

### 8. `apps/api/src/index.ts` の冒頭で env を import

```diff
+import { env } from "./env"
 import express from "express"
 /** ... */

 const app = express()
-app.listen(process.env.PORT || 8080, () => {
+app.listen(env.PORT, () => {
-  logger.info(`API server started on port ${process.env.PORT || 8080}`)
+  logger.info("API server started", { port: env.PORT })
 })
```

`./env` の import を **最上位に置く** ことで、env 検証が起動時の最初に走るようにする。

### 9. `apps/api/package.json` の修正

```diff
   "dependencies": {
     "@repo/db": "workspace:^",
     "@repo/api-schema": "workspace:^",
+    "@repo/config": "workspace:^",
     "@repo/errors": "workspace:^",
     "@repo/logger": "workspace:^",
```

```diff
+    "zod": "^3.25.76"
```

`apps/api` 側で直接 zod を使うので、devDependencies ではなく dependencies に明示追加。

### 10. 既存コードの `process.env.XXX` 参照箇所

この step では **書き換えない**（step5 で一括書き換え）。`env.ts` を新設して起動時検証だけ走る状態にする。既存コードは引き続き `process.env.JWT_SECRET` 等を参照しているが、env 検証で値の存在が保証されている。

## 動作確認

### 単体確認

```bash
cd packages/config
pnpm install
pnpm build

# baseEnvSchema が正しく動く
node -e "
const { baseEnvSchema, loadEnv } = require('./dist');
process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
const env = baseEnvSchema.parse(process.env);
console.log(env);
"
```

期待出力：

```
{
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://localhost:5432/test',
  LOG_LEVEL: 'info',
  LOGGER_TYPE: 'pino'
}
```

### バリデーション失敗時の挙動

```bash
node -e "
const { baseEnvSchema, loadEnv } = require('./dist');
delete process.env.DATABASE_URL;
loadEnv(baseEnvSchema);
"
# → ❌ Invalid environment variables: ... DATABASE_URL is required
# → exit code 1
echo $?  # 1
```

### apps/api 起動時の env 検証

```bash
cd apps/api
pnpm build

# 正常起動
pnpm start
# → logger.info("API server started", { port: 8080 })

# JWT_SECRET を 32 文字未満にしてみる
JWT_SECRET=short pnpm start
# → ❌ Invalid environment variables: JWT_SECRET String must contain at least 32 character(s)
# → exit code 1
```

### テスト

```bash
cd apps/api
pnpm test:ci
```

テスト環境でも env 検証が走るため、`apps/api/test/setup.ts` 等で必須 env が揃っていることを確認する。`.env.local`（dotenvx 復号化済み）に含まれている前提。

**ゴール**: `apps/api/src/env.ts` が起動時に env を検証して `env` を export する状態。既存テストが緑のまま、不正な env では即座にプロセスが落ちる。
