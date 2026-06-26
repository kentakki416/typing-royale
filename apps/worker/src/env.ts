import { z } from "zod"

/**
 * apps/worker の環境変数スキーマ
 *
 * このモジュールが import された時点で safeParse が走り、
 * 不正な env の場合は stderr にエラーを出力して process.exit(1) で停止する。
 */
const workerEnvSchema = z
  .object({
    /** S3CardStorage 用の AWS リージョン (REWARDS_STORAGE=s3 のとき)。未指定なら SDK 既定解決 */
    AWS_REGION: z.string().optional(),
    /** Prisma の接続文字列。NODE_ENV !== "test" のときは必須 */
    DATABASE_URL: z.string().url().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    /** ロガー実装の選択 */
    LOGGER_TYPE: z
      .enum(["pino", "winston", "console", "silent"])
      .default("pino"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /** Redis 接続 URL (BullMQ 用)。NODE_ENV !== "test" のときは必須 */
    REDIS_URL: z.string().optional(),
    /**
     * 生成した PNG の保存先ディレクトリ。apps/api の REWARDS_CACHE_DIR と同じ値を
     * 指す必要がある（worker が書き、api が静的配信するため）
     */
    REWARDS_CACHE_DIR: z.string().default("/tmp/typing-royale-rewards"),
    /** S3 保存時の公開 URL ベース (例: https://bucket.s3.region.amazonaws.com)。REWARDS_STORAGE=s3 のとき必須 */
    REWARDS_PUBLIC_URL_BASE: z.string().url().optional(),
    /** PNG の公開 URL prefix。apps/api の REWARDS_PUBLIC_URL_PREFIX と揃える */
    REWARDS_PUBLIC_URL_PREFIX: z.string().default("/cache/rewards"),
    /** S3 保存時のバケット名。REWARDS_STORAGE=s3 のとき必須 */
    REWARDS_S3_BUCKET: z.string().optional(),
    /** カード PNG の保存先。"s3" なら S3CardStorage、それ以外は LocalCardStorage */
    REWARDS_STORAGE: z.enum(["local", "s3"]).default("local"),
    /** Worker の並行ジョブ数 */
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "test" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required when NODE_ENV is not 'test'",
        path: ["DATABASE_URL"],
      })
    }
    if (env.NODE_ENV !== "test" && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REDIS_URL is required when NODE_ENV is not 'test'",
        path: ["REDIS_URL"],
      })
    }
    if (env.REWARDS_STORAGE === "s3" && !env.REWARDS_S3_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REWARDS_S3_BUCKET is required when REWARDS_STORAGE is 's3'",
        path: ["REWARDS_S3_BUCKET"],
      })
    }
    if (env.REWARDS_STORAGE === "s3" && !env.REWARDS_PUBLIC_URL_BASE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REWARDS_PUBLIC_URL_BASE is required when REWARDS_STORAGE is 's3'",
        path: ["REWARDS_PUBLIC_URL_BASE"],
      })
    }
  })

const result = workerEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type WorkerEnv = typeof env
