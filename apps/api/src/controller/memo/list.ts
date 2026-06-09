import { Request, Response } from "express"

import { ErrorResponse, getMemoListResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { MemoRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * メモ一覧取得API
 * 業務エラーは Result の statusCode をそのまま返却
 * 予期しない例外はグローバルエラーハンドラに委譲（throw を catch しない）
 */
export class MemoListController {
  constructor(private memoRepository: MemoRepository) {}

  async execute(_req: Request, res: Response) {
    const result = await service.memo.getAllMemos({ memoRepository: this.memoRepository })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = parseResponse(getMemoListResponseSchema, {
      memos: result.value.map((memo) => ({
        body: memo.body,
        created_at: memo.createdAt.toISOString(),
        id: memo.id,
        title: memo.title,
        updated_at: memo.updatedAt.toISOString(),
      })),
    })
    return res.status(200).json(response)
  }
}
