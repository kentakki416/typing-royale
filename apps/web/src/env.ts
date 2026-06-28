import "server-only"

import { z } from "zod"

/**
 * apps/web の server-side 環境変数スキーマ
 *
 * Server Action / Route Handler / middleware など server で動く箇所から参照する。
 * `server-only` で client component からの import を防ぐ。
 *
 * import 時点で safeParse が走り、不正な env の場合は process.exit(1) で停止する。
 */
const webEnvSchema = z
  .object({
    /**
     * Express API の origin（Server Action / Route Handler から API を叩く際に使用）
     */
    API_URL: z.string().url().default("http://localhost:8080"),

    /**
     * GitHub OAuth クライアント ID
     * NODE_ENV !== "test" の場合は必須（superRefine で検証）
     */
    GITHUB_CLIENT_ID: z.string().default(""),

    /**
     * Google AdSense のパブリッシャー ID（例: "ca-pub-1234567890123456"）
     * 未設定（空文字）の場合は広告スクリプト・広告ユニットを一切描画しない。
     * AdSense アカウント審査通過後に Vercel の環境変数として設定する。
     * NEXT_PUBLIC_ prefix によりクライアント側でも参照可能（ビルド時にインライン化）。
     */
    NEXT_PUBLIC_ADSENSE_CLIENT_ID: z.string().default(""),

    /**
     * トップ画面メインカラム下部に設置する広告ユニットのスロット ID（AdSense 管理画面で発行）
     * 未設定でも AdUnit 側で NEXT_PUBLIC_ADSENSE_CLIENT_ID を見て描画判定するため安全。
     */
    NEXT_PUBLIC_ADSENSE_SLOT_HOME: z.string().default(""),

    /**
     * トップ画面サイドバー（対応言語カードの下）に設置する広告ユニットのスロット ID
     */
    NEXT_PUBLIC_ADSENSE_SLOT_HOME_SIDEBAR: z.string().default(""),

    /**
     * フロント自身の origin（OAuth redirect_uri 構築に使用）
     */
    NEXT_PUBLIC_APP_URL: z.string().url(),

    /**
     * 実行環境
     */
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .superRefine((env, ctx) => {
    /**
     * NODE_ENV !== "test" の場合、GitHub OAuth の env を必須化する
     * test 環境ではフロー自体をモックするため未設定でも可
     */
    if (env.NODE_ENV !== "test") {
      if (env.GITHUB_CLIENT_ID.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "GITHUB_CLIENT_ID is required when NODE_ENV is not 'test'",
          path: ["GITHUB_CLIENT_ID"],
        })
      }
    }
  })

const result = webEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("❌ Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type WebEnv = typeof env
