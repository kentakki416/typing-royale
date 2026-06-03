import { Request, Response } from "express"

import { createMemoRequestSchema, createMemoResponseSchema, ErrorResponse } from "@repo/api-schema"

import { MemoRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * メモ作成API
 */
export class MemoCreateController {
  constructor(private memoRepository: MemoRepository) {}

  async execute(req: Request, res: Response) {
    const data = createMemoRequestSchema.parse(req.body)

    const result = await service.memo.createMemo(data, { memoRepository: this.memoRepository })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = createMemoResponseSchema.parse({
      body: result.value.body,
      created_at: result.value.createdAt.toISOString(),
      id: result.value.id,
      title: result.value.title,
      updated_at: result.value.updatedAt.toISOString(),
    })
    return res.status(201).json(response)
  }
}
