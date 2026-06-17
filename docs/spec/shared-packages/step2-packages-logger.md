# step2-packages-logger.md

`@repo/logger` パッケージを新設し、`apps/api/src/log/` 配下を物理移設する。完了時点で `apps/api` は `@repo/logger` から `logger` / `LoggerFactory` / `logContext` を import 可能になる（既存パスも wrapper で互換維持）。

## 対応内容

### 1. ディレクトリ作成

```
packages/logger/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .gitignore
└── src/
    ├── const.ts                # LOGGER_TYPE
    ├── interface.ts
    ├── context.ts
    ├── logger-factory.ts
    ├── console-logger.ts
    ├── pino-logger.ts
    ├── winston-logger.ts
    ├── silent-logger.ts
    └── index.ts
```

### 2. `packages/logger/package.json`

```json
{
  "name": "@repo/logger",
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
    "pino": "^10.1.0",
    "pino-pretty": "^13.1.3",
    "winston": "^3.19.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:^",
    "@repo/typescript-config": "workspace:^",
    "@types/node": "^24.10.1",
    "eslint": "^9.39.1",
    "typescript": "^5.9.3"
  }
}
```

### 3. `packages/logger/src/const.ts`

`apps/api/src/const/index.ts` から `LOGGER_TYPE` / `NODE_ENV` / `LOG_LEVEL` 定数を移設する。これらは logger 実装内部（pino-logger / winston-logger 等）でも参照するため、logger パッケージにまとめて置いた方が結合が綺麗になる。

```typescript
/**
 * Logger 実装の種別
 * 環境変数 LOGGER_TYPE で選択される
 */
export const LOGGER_TYPE = {
  CONSOLE: "console",
  PINO: "pino",
  SILENT: "silent",
  WINSTON: "winston",
} as const

export type LoggerType = typeof LOGGER_TYPE[keyof typeof LOGGER_TYPE]

/**
 * Node の実行環境
 */
export const NODE_ENV = {
  DEV: "development",
  PRD: "production",
} as const

/**
 * ログレベル
 */
export const LOG_LEVEL = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
} as const
```

### 4. `packages/logger/src/interface.ts`

`apps/api/src/log/interface.ts` を **そのまま** 移設。

```typescript
/**
 * ログメタデータの型定義
 */
export type LogMetadata = Record<string, unknown>

/**
 * Logger interface
 * 構造化ロギングのための共通インターフェース
 */
export interface ILogger {
  /**
   * デバッグレベルのログ
   */
  debug(message: string, metadata?: LogMetadata): void

  /**
   * 情報レベルのログ
   */
  info(message: string, metadata?: LogMetadata): void

  /**
   * 警告レベルのログ
   */
  warn(message: string, metadata?: LogMetadata): void

  /**
   * エラーレベルのログ
   * Error オブジェクトを渡すと、スタックトレースも記録される
   */
  error(message: string, error?: Error, metadata?: LogMetadata): void
}
```

### 5. `packages/logger/src/context.ts`

`apps/api/src/log/context.ts` を移設。**Express 依存があれば削除して AsyncLocalStorage だけ残す**。

```typescript
import { AsyncLocalStorage } from "async_hooks"

/**
 * リクエストスコープのログコンテキスト
 * Express middleware や cron の job 開始時に logContext.run({...}, fn) で設定する
 */
export interface LogContext {
  requestId?: string
  userId?: number | string
}

export const logContext = new AsyncLocalStorage<LogContext>()
```

- `userId` は `number | string` 両対応（GitHub OAuth の provider account id を string で持つケース、内部 user id を number で持つケースの両方を吸収）
- cron / batch から呼ぶ場合も同じ `requestId` フィールドで job 識別子を渡せばよい（jobId 専用フィールドは設けない）

### 6. `packages/logger/src/{console,pino,winston,silent}-logger.ts`

`apps/api/src/log/` から **そのまま** 移設。各実装ファイル内で `context.ts` の `logContext` を import している場合は、import パスを相対パスのまま維持できる。

### 7. `packages/logger/src/logger-factory.ts`

`apps/api/src/log/logger-factory.ts` を移設。`import { LOGGER_TYPE } from "../const"` を `import { LOGGER_TYPE } from "./const"` に書き換える。

```typescript
import { LOGGER_TYPE, type LoggerType } from "./const"
import { ConsoleLogger } from "./console-logger"
import type { ILogger } from "./interface"
import { PinoLogger } from "./pino-logger"
import { SilentLogger } from "./silent-logger"
import { WinstonLogger } from "./winston-logger"

/**
 * Logger Factory
 * 環境変数 LOGGER_TYPE に基づいて適切な Logger インスタンスを生成
 */
export class LoggerFactory {
  private static instance: ILogger | null = null

  /**
   * Logger インスタンスを取得（シングルトン）
   */
  static getLogger(): ILogger {
    if (this.instance) {
      return this.instance
    }
    const loggerType = (process.env.LOGGER_TYPE || LOGGER_TYPE.PINO) as LoggerType
    this.instance = this.createLogger(loggerType)
    return this.instance
  }

  /**
   * Logger インスタンスを明示的に作成
   * テスト時などに使用
   */
  static createLogger(type: LoggerType): ILogger {
    switch (type) {
    case LOGGER_TYPE.CONSOLE:
      return new ConsoleLogger()
    case LOGGER_TYPE.PINO:
      return new PinoLogger()
    case LOGGER_TYPE.SILENT:
      return new SilentLogger()
    case LOGGER_TYPE.WINSTON:
      return new WinstonLogger()
    default:
      return new WinstonLogger()
    }
  }

  /**
   * シングルトンインスタンスをリセット
   * テストで logger を入れ替えるときに使う
   */
  static reset(): void {
    this.instance = null
  }
}

/**
 * デフォルトの Logger インスタンス
 * アプリケーション全体で使用
 */
export const logger = LoggerFactory.getLogger()
```

### 8. `packages/logger/src/index.ts`

```typescript
export { ConsoleLogger } from "./console-logger"
export { LOG_LEVEL, LOGGER_TYPE, NODE_ENV } from "./const"
export type { LoggerType } from "./const"
export { logContext } from "./context"
export type { LogContext } from "./context"
export type { ILogger, LogMetadata } from "./interface"
export { logger, LoggerFactory } from "./logger-factory"
export { PinoLogger } from "./pino-logger"
export { SilentLogger } from "./silent-logger"
export { WinstonLogger } from "./winston-logger"
```

`LOG_LEVEL` / `NODE_ENV` / `LOGGER_TYPE` / `LoggerType` を `@repo/logger` から re-export することで、apps/api 側からは `const/index.ts` を介さず `@repo/logger` だけ見れば全部揃う形にする。

### 9. `packages/logger/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "composite": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 10. `packages/logger/.gitignore` / `eslint.config.js`

```
# .gitignore
dist/
node_modules/
```

eslint config は `packages/schema/eslint.config.js` をコピー。

### 11. `apps/api` 側の互換 wrapper

> **現在の状態**: step6 完了済みのため、`apps/api/src/log/` ディレクトリは **既に削除されている**。step2 単独移行時は以下の 1 行 wrapper を一時的に置いて互換維持していた（履歴記録）。

`apps/api/src/log/index.ts` を 1 行に置き換え：

```typescript
/**
 * @deprecated step6 で削除予定。新規コードは "@repo/logger" から直接 import すること
 */
export * from "@repo/logger"
```

`apps/api/src/log/` 配下の他のファイル（console-logger.ts / pino-logger.ts / 等）は **物理的に削除**（packages/logger に移設済みのため）。step6 完了時点では `apps/api/src/log/index.ts` 自体も削除済み。

`apps/api/src/const/index.ts` から `LOGGER_TYPE` を削除し、`@repo/logger` から re-export する：

```diff
-export const LOGGER_TYPE = {
-  CONSOLE: "console",
-  PINO: "pino",
-  SILENT: "silent",
-  WINSTON: "winston",
-} as const
+export { LOGGER_TYPE } from "@repo/logger"
```

### 12. `apps/api/package.json` の修正

```diff
   "dependencies": {
     "@repo/db": "workspace:^",
     "@repo/api-schema": "workspace:^",
+    "@repo/logger": "workspace:^",
     "cors": "^2.8.5",
     "express": "^5.1.0",
     "google-auth-library": "^10.5.0",
     "ioredis": "^5.10.0",
     "jsonwebtoken": "^9.0.3",
-    "pino": "^10.1.0",
-    "pino-pretty": "^13.1.3",
     "uuid": "^13.0.0",
-    "winston": "^3.19.0"
+    "uuid": "^13.0.0"
   }
```

`pino` / `pino-pretty` / `winston` の依存は `@repo/logger` 側に集約され、apps/api からは消える。

## 動作確認

### 単体確認

```bash
cd packages/logger
pnpm install
pnpm build

# 型定義が出力されている
test -f packages/logger/dist/index.d.ts && echo OK

# logger を import して呼び出せる
node -e "
const { logger, LoggerFactory } = require('./dist');
logger.info('hello from @repo/logger', { foo: 'bar' });
LoggerFactory.reset();
const silent = LoggerFactory.createLogger('silent');
silent.info('this should not appear');
console.log('OK');
"
```

### apps/api 側の確認

```bash
cd apps/api
pnpm build

# 既存 wrapper 経由でも動く
node -e "const { logger } = require('./dist/log'); logger.info('wrapper works')"

# 直接 import でも動く
node -e "const { logger } = require('@repo/logger'); logger.info('direct works')"
```

### Logger 切り替えの確認

```bash
LOGGER_TYPE=console node -e "const { logger } = require('@repo/logger'); logger.info('console mode')"
LOGGER_TYPE=pino node -e "const { logger } = require('@repo/logger'); logger.info('pino mode')"
LOGGER_TYPE=silent node -e "const { logger } = require('@repo/logger'); logger.info('silent mode (no output)')"
```

### コンテキスト伝播の確認

```typescript
// 一時スクリプトで確認
import { logger, logContext } from "@repo/logger"

logContext.run({ requestId: "req-123", userId: 42 }, () => {
  logger.info("inside context")  // requestId / userId が出力に含まれる
})
logger.info("outside context")  // requestId / userId なし
```

### テスト

```bash
cd apps/api
pnpm test:ci
```

**ゴール**: `apps/api` の既存テストが緑のまま、`apps/api/src/log/` が wrapper 1 ファイル（`index.ts`）だけになり、Logger 関連の依存（pino / winston）が `apps/api/package.json` から消えている状態。
