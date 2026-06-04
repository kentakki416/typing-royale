import { z } from "zod"

import { baseEnvSchema, loadEnv } from "@repo/config"

/**
 * apps/api の環境変数スキーマ
 * baseEnvSchema を継承し、API 固有の env を追加する
 *
 * 起動時にこのモジュールが import された時点で loadEnv が走り、
 * 不正な env の場合は process.exit(1) で停止する。
 *
 * step6 で各所の process.env.XXX 参照を env.XXX に書き換える予定。
 */
const apiEnvSchema = baseEnvSchema.extend({
  /**
   * Express サーバーの待受ポート
   */
  PORT: z.coerce.number().int().positive().default(8080),

  /**
   * フロントエンドの origin（OAuth callback redirect 等で使用）
   */
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  /**
   * Google OAuth クライアント ID
   * dev 環境では "dummy" でも動くため optional 扱い
   */
  GOOGLE_CLIENT_ID: z.string().default("dummy"),

  /**
   * Google OAuth クライアントシークレット
   */
  GOOGLE_CLIENT_SECRET: z.string().default("dummy"),

  /**
   * GitHub OAuth クライアント ID
   * dev 環境では "dummy" でも動くため optional 扱い
   */
  GITHUB_CLIENT_ID: z.string().default("dummy"),

  /**
   * GitHub OAuth クライアントシークレット
   */
  GITHUB_CLIENT_SECRET: z.string().default("dummy"),

  /**
   * Access Token 署名鍵
   */
  JWT_ACCESS_SECRET: z.string().min(32),

  /**
   * Refresh Token 署名鍵
   */
  JWT_REFRESH_SECRET: z.string().min(32),

  /**
   * Access Token 有効期限（例: "15m" / "1h"）
   */
  JWT_ACCESS_EXPIRATION: z.string().default("15m"),

  /**
   * Refresh Token 有効期限（例: "7d" / "30d"）
   */
  JWT_REFRESH_EXPIRATION: z.string().default("7d"),

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
 * import 時点で process.exit(1) する可能性あり
 */
export const env = loadEnv(apiEnvSchema)

export type ApiEnv = typeof env
