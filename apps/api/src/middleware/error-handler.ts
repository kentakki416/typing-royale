import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"

import { logger } from "../log"

/**
 * ZodError かどうかを判定する（zod パッケージを直接依存せずに判定するため name チェック）
 */
const isZodError = (err: unknown): err is Error & { issues: unknown[] } =>
  err instanceof Error && err.name === "ZodError" && Array.isArray((err as { issues?: unknown }).issues)

/**
 * ルート内で発生したがキャッチされなかった例外を適切な HTTP ステータスで返す最終ハンドラ
 * Service が業務エラーを Result として返却する運用と対になる:
 *   - Result.err(4xx) → Controller が sendResult で返却
 *   - ZodError（バリデーション失敗） → ここで捕捉して 400
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
   * Zod のバリデーション失敗は 400 Bad Request
   */
  if (isZodError(err)) {
    logger.warn(`Validation error at ${req.method} ${req.path}`, { issues: err.issues })
    const errorResponse: ErrorResponse = {
      error: "Invalid request",
      status_code: 400,
    }
    return res.status(400).json(errorResponse)
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
