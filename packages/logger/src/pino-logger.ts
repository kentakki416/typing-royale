import pino from "pino"

import { LOG_LEVEL, NODE_ENV } from "./const"
import { logContext } from "./context"
import type { ILogger, LogMetadata } from "./interface"

type NodeEnv = typeof NODE_ENV[keyof typeof NODE_ENV]

/**
 * Pino Logger
 */
export class PinoLogger implements ILogger {
  private logger: pino.Logger

  constructor() {
    const env = (process.env.NODE_ENV || NODE_ENV.DEV) as NodeEnv
    const logLevel = env === NODE_ENV.PRD ? LOG_LEVEL.INFO : LOG_LEVEL.DEBUG

    /**
     * 開発環境: pino-pretty で可読性向上
     * 本番環境: JSON 形式で stdout に出力
     */
    this.logger = pino(
      {
        base: {
          env: env,
        },
        level: logLevel,
        mixin: () => {
          return logContext.getStore() || {}
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      env === NODE_ENV.PRD
        ? process.stdout
        : pino.transport({
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "yyyy-mm-dd HH:MM:ss",
          },
          target: "pino-pretty",
        })
    )
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.logger.debug(metadata || {}, message)
  }

  info(message: string, metadata?: LogMetadata): void {
    this.logger.info(metadata || {}, message)
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.logger.warn(metadata || {}, message)
  }

  error(message: string, error?: Error, metadata?: LogMetadata): void {
    if (error) {
      this.logger.error(
        {
          err: {
            message: error.message,
            stack: error.stack,
          },
          ...metadata,
        },
        message
      )
    } else {
      this.logger.error(metadata || {}, message)
    }
  }
}
