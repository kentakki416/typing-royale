import { Request, Response } from "express"

import { ErrorResponse, updateMemoPathParamSchema, updateMemoRequestSchema, updateMemoResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { MemoRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * メモ更新API
 */
export class MemoUpdateController {
  constructor(private memoRepository: MemoRepository) {}

  async execute(req: Request, res: Response) {
    const { id } = parseRequest(updateMemoPathParamSchema, req.params)
    const data = parseRequest(updateMemoRequestSchema, req.body)

    const result = await service.memo.updateMemo(id, data, { memoRepository: this.memoRepository })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = parseResponse(updateMemoResponseSchema, {
      body: result.value.body,
      created_at: result.value.createdAt.toISOString(),
      id: result.value.id,
      title: result.value.title,
      updated_at: result.value.updatedAt.toISOString(),
    })
    return res.status(200).json(response)
  }
}
