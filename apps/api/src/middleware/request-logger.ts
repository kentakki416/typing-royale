import crypto from "crypto"

import type { Request, Response, NextFunction } from "express"

import { LOG_EXCLUDE_PATHS } from "../const"
import { logger, logContext } from "../log"

import type { AuthRequest } from "./auth"

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // ヘルスチェック等はログ除外
  if (LOG_EXCLUDE_PATHS.some(path => path === req.path)) {
    return next()
  }

  const startTime = Date.now()
  const requestId = crypto.randomUUID()
  const authReq = req as AuthRequest
  const userId = authReq.userId || "unauthenticated"

  // AsyncLocalStorageでコンテキストを設定
  // この中で実行される全てのログに自動的にrequestId/userIdが含まれる
  logContext.run({ requestId, userId }, () => {
    // リクエスト受信時のログ
    logger.info("API Request Received", {
      duration: 0,
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
      userAgent: req.get("user-agent") || "unknown",
    })

    // レスポンス完了時のログ
    res.on("finish", () => {
      const duration = Date.now() - startTime

      logger.info("API Request Completed", {
        duration,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
      })
    })

    // 予期しないクローズ時のログ（クライアント切断、タイムアウト等）
    res.on("close", () => {
      if (!res.writableEnded) {
        const duration = Date.now() - startTime

        logger.warn("API Request Closed Unexpectedly", {
          duration,
          method: req.method,
          path: req.originalUrl,
        })
      }
    })

    next()
  })
}
