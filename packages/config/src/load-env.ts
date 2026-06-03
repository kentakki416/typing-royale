import type { ZodSchema, z as zType } from "zod"

/**
 * process.env を Zod スキーマで検証して型付きオブジェクトを返す
 * 検証失敗時は stderr にエラーを出力して process.exit(1) で停止する
 *
 * @example
 * import { z } from "zod"
 * import { loadEnv, baseEnvSchema } from "@repo/config"
 *
 * const appEnvSchema = baseEnvSchema.extend({
 *   PORT: z.coerce.number().default(8080),
 * })
 *
 * export const env = loadEnv(appEnvSchema)
 * env.PORT // number 型
 */
export const loadEnv = <T extends ZodSchema>(schema: T): zType.infer<T> => {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    /* eslint-disable no-console */
    console.error("❌ Invalid environment variables:")
    console.error(JSON.stringify(result.error.format(), null, 2))
    /* eslint-enable no-console */
    process.exit(1)
  }
  return result.data
}
