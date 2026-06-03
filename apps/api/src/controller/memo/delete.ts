import { Request, Response } from "express"

import { deleteMemoPathParamSchema, deleteMemoResponseSchema, ErrorResponse } from "@repo/api-schema"

import { MemoRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * メモ削除API
 */
export class MemoDeleteController {
  constructor(private memoRepository: MemoRepository) {}

  async execute(req: Request, res: Response) {
    const { id } = deleteMemoPathParamSchema.parse(req.params)

    const result = await service.memo.deleteMemo(id, { memoRepository: this.memoRepository })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = deleteMemoResponseSchema.parse({ message: "Memo deleted successfully" })
    return res.status(200).json(response)
  }
}
