import { Request, Response } from "express"

import { ErrorResponse, getMemoPathParamSchema, getMemoResponseSchema } from "@repo/api-schema"

import { MemoRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * メモ詳細取得API
 */
export class MemoDetailController {
  constructor(private memoRepository: MemoRepository) {}

  async execute(req: Request, res: Response) {
    const { id } = getMemoPathParamSchema.parse(req.params)

    const result = await service.memo.getMemoById(id, { memoRepository: this.memoRepository })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getMemoResponseSchema.parse({
      body: result.value.body,
      created_at: result.value.createdAt.toISOString(),
      id: result.value.id,
      title: result.value.title,
      updated_at: result.value.updatedAt.toISOString(),
    })
    return res.status(200).json(response)
  }
}
