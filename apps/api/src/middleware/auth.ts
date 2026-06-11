import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"

import { PROTECTED_PATHS, PUBLIC_PATHS } from "../const"
import { verifyAccessToken } from "../lib/jwt"

export interface AuthRequest extends Request {
  userId?: number
}

const isProtected = (path: string): boolean =>
  PROTECTED_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

const isPublic = (path: string): boolean =>
  PUBLIC_PATHS.some((p) => path.startsWith(p))

/**
 * 認証ミドルウェア
 *
 * 1. PROTECTED_PATHS にマッチするパス: 必ず token 検証（401 で弾く）
 * 2. PUBLIC_PATHS にマッチするパス: token があれば userId を埋め、無ければ guest として素通り
 * 3. それ以外のパス: 通常の認証必須（401 で弾く）
 *
 * `/api/play-sessions` は 2. に該当する。guest プレイ時は req.userId が undefined のまま
 * Controller → Service に進み、Service 側で DB 書き込みをスキップする。
 */
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const protectedPath = isProtected(req.path)
  const publicPath = !protectedPath && isPublic(req.path)

  const authHeader = req.headers.authorization
  const hasBearer = authHeader !== undefined && authHeader.startsWith("Bearer ")

  /**
   * token が提示されていれば常に検証する（public でもログインユーザーの動線維持）。
   * invalid token はログインユーザーの不正リクエストとみなして必ず 401（public でも素通りさせない）。
   */
  if (hasBearer) {
    const token = authHeader.substring(7)
    const payload = verifyAccessToken(token)
    if (payload === null) {
      const errorResponse: ErrorResponse = {
        error: "Invalid or expired token",
        status_code: 401,
      }
      return res.status(401).json(errorResponse)
    }
    req.userId = payload.userId
    return next()
  }

  /**
   * token 無し: public なら guest として素通り、それ以外は 401
   */
  if (publicPath) {
    return next()
  }

  const errorResponse: ErrorResponse = {
    error: "No token provided",
    status_code: 401,
  }
  return res.status(401).json(errorResponse)
}
