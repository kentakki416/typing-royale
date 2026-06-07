import { gzipSync } from "node:zlib"

import { PrismaClient } from "@repo/db"

import { KeystrokeLog } from "../../types/domain"

import { TransactionContext } from "./transaction-runner"

/**
 * KeystrokeLog リポジトリのインターフェース
 *
 * gzip 圧縮は Repository 内部で行う（生 JSON は外部に渡さない）
 */
export interface KeystrokeLogRepository {
    create(playSessionId: number, log: KeystrokeLog, tx?: TransactionContext): Promise<void>
}

/**
 * Prisma 実装の KeystrokeLog リポジトリ
 */
export class PrismaKeystrokeLogRepository implements KeystrokeLogRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async create(playSessionId: number, log: KeystrokeLog, tx?: TransactionContext): Promise<void> {
    const client = tx ?? this._prisma
    const compressed = gzipSync(Buffer.from(JSON.stringify(log)))
    await client.keystrokeLog.create({
      data: { compressedLog: compressed, playSessionId },
    })
  }
}
