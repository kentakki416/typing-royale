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

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  /**
   * 公開パスは認証不要。ただし PROTECTED_PATHS（/api/rankings/me 等）に
   * マッチする場合は PUBLIC_PATHS の prefix match を打ち消して認証強制
   */
  if (!isProtected(req.path) && isPublic(req.path)) {
    return next()
  }

  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const errorResponse: ErrorResponse = {
        error: "No token provided",
        status_code: 401,
      }
      return res.status(401).json(errorResponse)
    }

    const token = authHeader.substring(7)
    const payload = verifyAccessToken(token)

    if (!payload) {
      const errorResponse: ErrorResponse = {
        error: "Invalid or expired token",
        status_code: 401,
      }
      return res.status(401).json(errorResponse)
    }

    req.userId = payload.userId
    return next()
  } catch {
    const errorResponse: ErrorResponse = {
      error: "Authentication failed",
      status_code: 500,
    }
    res.status(500).json(errorResponse)
  }
}