import { z } from "zod"

/**
 * apps/cron の環境変数スキーマ
 *
 * 起動時にこのモジュールが import された時点で safeParse が走り、
 * 不正な env の場合は stderr にエラーを出力して process.exit(1) で停止する。
 *
 */
const cronEnvSchema = z
  .object({
    CRAWLER_MIN_STARS: z.coerce.number().int().positive().default(1000),
    /** 実行日からの相対計算でデフォルト値を組み立てるため optional */
    CRAWLER_PUSHED_AFTER: z.string().optional(),
    CRAWLER_REPOS_PER_RUN: z.coerce.number().int().positive().default(1),
    DATABASE_URL: z.string().url().optional(),
    GITHUB_PAT: z.string().default(""),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOGGER_TYPE: z.enum(["pino", "winston", "console", "silent"]).default("pino"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    SENTRY_DSN: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    /**
     * NODE_ENV !== "test" のとき GITHUB_PAT は必須
     * （未設定だとクローラが GitHub API に叩けない）
     */
    if (env.NODE_ENV !== "test" && env.GITHUB_PAT.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GITHUB_PAT is required when NODE_ENV is not 'test'",
        path: ["GITHUB_PAT"],
      })
    }
    /**
     * NODE_ENV !== "test" のとき DATABASE_URL も必須
     * （task は DB なしで起動できない）
     */
    if (env.NODE_ENV !== "test" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required when NODE_ENV is not 'test'",
        path: ["DATABASE_URL"],
      })
    }
    /**
     * production では SENTRY_DSN も必須（本番エラー検知漏れ防止）
     */
    if (env.NODE_ENV === "production" && env.SENTRY_DSN.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SENTRY_DSN is required when NODE_ENV is 'production'",
        path: ["SENTRY_DSN"],
      })
    }
  })

const result = cronEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("❌ Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type CronEnv = typeof env
