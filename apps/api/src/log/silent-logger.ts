import type { ILogger, LogMetadata } from "./interface"

/**
 * Silent Logger
 * 何も出力しないロガー。テスト時にログノイズを抑制するために使用
 */
export class SilentLogger implements ILogger {
  debug(_message: string, _metadata?: LogMetadata): void {
    /* noop */
  }

  info(_message: string, _metadata?: LogMetadata): void {
    /* noop */
  }

  warn(_message: string, _metadata?: LogMetadata): void {
    /* noop */
  }

  error(_message: string, _error?: Error, _metadata?: LogMetadata): void {
    /* noop */
  }
}
