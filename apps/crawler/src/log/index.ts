import pino from "pino"

/**
 * crawler / batch 共通ロガー
 *
 * NODE_ENV が production 以外の場合は pino-pretty で人間向け整形を行う。
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV === "production"
    ? {}
    : {
      transport: {
        options: { colorize: true, translateTime: "SYS:standard" },
        target: "pino-pretty",
      },
    }),
})
