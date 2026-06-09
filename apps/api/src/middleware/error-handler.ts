import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { RequestSchemaMismatchError, ResponseSchemaMismatchError } from "../lib/parse-schema"

/**
 * ルート内で発生したがキャッチされなかった例外を適切な HTTP ステータスで返す最終ハンドラ
 * Service が業務エラーを Result として返却する運用と対になる:
 *   - Result.err(4xx) → Controller が if/else で透過返却
 *   - RequestSchemaMismatchError → ここで捕捉して 400 (クライアント入力不正)
 *   - ResponseSchemaMismatchError → ここで捕捉して 500 (サーバ起因の契約違反)
 *   - 想定外の例外（DB 障害・ライブラリの throw 等） → ここで捕捉して 500
 *
 * Express の「引数が4つのミドルウェア」はエラーハンドラとして扱われるため
 * シグネチャは (err, req, res, next) で固定。next は呼ばないが Express の規約で受け取る
 */

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  /**
   * すでにレスポンス送信済みなら Express に委譲（二重送信防止）
   */
  if (res.headersSent) {
    return
  }

  /**
   * リクエスト検証失敗は 400 Bad Request
   */
  if (err instanceof RequestSchemaMismatchError) {
    logger.warn(`Request validation error at ${req.method} ${req.path}`, {
      issues: err.zodError.issues,
    })
    const errorResponse: ErrorResponse = {
      error: "Invalid request",
      status_code: 400,
    }
    return res.status(400).json(errorResponse)
  }

  /**
   * レスポンス検証失敗は 500 Internal Server Error（サーバ側で契約違反）
   */
  if (err instanceof ResponseSchemaMismatchError) {
    logger.error(`Response schema mismatch at ${req.method} ${req.path}`, err.zodError)
    const errorResponse: ErrorResponse = {
      error: "Internal Server Error",
      status_code: 500,
    }
    return res.status(500).json(errorResponse)
  }

  /**
   * 想定外の例外は 500 Internal Server Error
   */
  logger.error(
    `Unhandled error at ${req.method} ${req.path}`,
    err instanceof Error ? err : new Error(String(err))
  )

  const errorResponse: ErrorResponse = {
    error: "Internal Server Error",
    status_code: 500,
  }
  res.status(500).json(errorResponse)
}
