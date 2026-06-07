import type { Redis } from "@repo/redis"

import { PlaySessionState } from "../../types/domain"

/**
 * プレイ中の揮発ステートを管理する Repository
 *
 * - Key: `play_session:{sessionId}`
 * - Value: JSON シリアライズした PlaySessionState
 * - TTL: 300 秒（120 秒のプレイ + バッファ）
 *
 * セッション開始から終了までイミュータブルなので、更新メソッドは持たせない
 */
export interface PlaySessionStateRepository {
    delete(sessionId: string): Promise<void>
    findById(sessionId: string): Promise<PlaySessionState | null>
    save(sessionId: string, state: PlaySessionState, ttlSeconds: number): Promise<void>
}

const keyOf = (sessionId: string): string => `play_session:${sessionId}`

/**
 * ioredis 実装の PlaySessionState リポジトリ
 */
export class IoRedisPlaySessionStateRepository implements PlaySessionStateRepository {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  async save(sessionId: string, state: PlaySessionState, ttlSeconds: number): Promise<void> {
    await this._redis.set(keyOf(sessionId), JSON.stringify(state), "EX", ttlSeconds)
  }

  async findById(sessionId: string): Promise<PlaySessionState | null> {
    const raw = await this._redis.get(keyOf(sessionId))
    if (raw === null) return null
    return JSON.parse(raw) as PlaySessionState
  }

  async delete(sessionId: string): Promise<void> {
    await this._redis.del(keyOf(sessionId))
  }
}
