import { Response } from "express"

import { unauthorizedError } from "@repo/errors"

import { AuthRequest } from "../middleware/auth"

import { sendError } from "./send-error"

/**
 * 認証必須コントローラの冒頭で呼ぶ narrowing helper。
 *
 * `req.userId` が確定していれば `number` を返し、`undefined` であれば
 * 401 を送出して `null` を返す。呼び出し側は `if (userId === null) return` で
 * 早期 return すれば、それ以降は `userId` を `number` として安全に扱える。
 *
 * 通常は `authMiddleware` が必ず弾くため 401 経路は dead path だが、
 * `req.userId!` の non-null assertion を排除して **型安全と防御的プログラミング**
 * の両立を狙う:
 *
 * - 型レベル: `req.userId` が `number | undefined` のままでも narrow できる
 * - 実行レベル: 万一 `authMiddleware` をすり抜けるバグが発生しても、controller
 *   が `service` に `undefined` を渡して伝播するのを防ぐ
 */
export const requireAuth = (req: AuthRequest, res: Response): number | null => {
  if (req.userId === undefined) {
    sendError(req, res, unauthorizedError("Authentication required"))
    return null
  }
  return req.userId
}
