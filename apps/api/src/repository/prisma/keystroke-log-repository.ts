import { gzipSync } from "node:zlib"

import { PrismaClient } from "@repo/db"

import { KeystrokeLogs } from "../../types/domain"

import { TransactionContext } from "./transaction-runner"

/**
 * KeystrokeLog リポジトリのインターフェース
 *
 * Prisma モデル名 `KeystrokeLog`（1 session = 1 row）に揃える。
 * カラム `compressed_log` には KeystrokeLogs 配列を gzip 圧縮したものを保存する
 */
export interface KeystrokeLogRepository {
    create(playSessionId: number, logs: KeystrokeLogs, tx?: TransactionContext): Promise<void>
}

/**
 * Prisma 実装の KeystrokeLog リポジトリ
 */
export class PrismaKeystrokeLogRepository implements KeystrokeLogRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async create(playSessionId: number, logs: KeystrokeLogs, tx?: TransactionContext): Promise<void> {
    const client = tx ?? this._prisma
    const compressed = gzipSync(Buffer.from(JSON.stringify(logs)))
    await client.keystrokeLog.create({
      data: { compressedLog: compressed, playSessionId },
    })
  }
}
