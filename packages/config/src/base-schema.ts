import { z } from "zod"

/**
 * すべての server-side app で共通で必要な環境変数のスキーマ
 * 各 app は baseEnvSchema.extend({ ... }) で app 固有の env を追加する
 *
 * step5 で REDIS_URL が追加される予定
 */
export const baseEnvSchema = z.object({
  /**
   * 実行環境
   */
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * Postgres 接続文字列
   * 例: postgresql://user:pass@host:5432/db
   *
   * 未指定の場合は packages/db 側でローカル開発用デフォルトにフォールバックする。
   * 本番デプロイ時は必ずセットされていることを deploy 側で保証する。
   */
  DATABASE_URL: z.string().url().optional(),

  /**
   * Postgres read replica の接続 URL
   * @prisma/extension-read-replicas で自動振り分けされる
   */
  DATABASE_REPLICA_URL: z.string().url().optional(),

  /**
   * Redis 接続 URL（省略時は @repo/redis が REDIS_HOST/PORT/PASSWORD/DB から組み立てる）
   */
  REDIS_URL: z.string().url().optional(),

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
