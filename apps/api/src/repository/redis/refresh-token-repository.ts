import type { Redis } from "@repo/redis"

/**
 * Refresh Token リポジトリのインターフェース
 *
 * Refresh Token は jti（JWT ID）をキーに userId を保存する。
 * ローテーション時は旧 jti を delete、新 jti を save する。
 *
 * `user_refresh_tokens:{userId}` という SET を二次インデックスとして保持し、
 * アカウント削除時に当該ユーザーの全 Refresh Token を一括削除できるようにする。
 */
export interface RefreshTokenRepository {
    delete(jti: string): Promise<void>
    deleteAllByUserId(userId: number): Promise<void>
    findUserId(jti: string): Promise<number | null>
    save(jti: string, userId: number, ttlSeconds: number): Promise<void>
}

const keyOf = (jti: string): string => `refresh_token:${jti}`
const userIndexKeyOf = (userId: number): string => `user_refresh_tokens:${userId}`

/**
 * ioredis 実装の Refresh Token リポジトリ
 */
export class IoRedisRefreshTokenRepository implements RefreshTokenRepository {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  async save(jti: string, userId: number, ttlSeconds: number): Promise<void> {
    /**
     * jti キー本体と user index SET を atomic に更新。
     * SET の TTL は jti と同じ秒数で更新（最後の jti が消えるまで生存）。
     */
    await this._redis
      .multi()
      .set(keyOf(jti), String(userId), "EX", ttlSeconds)
      .sadd(userIndexKeyOf(userId), jti)
      .expire(userIndexKeyOf(userId), ttlSeconds)
      .exec()
  }

  async findUserId(jti: string): Promise<number | null> {
    const raw = await this._redis.get(keyOf(jti))
    return raw === null ? null : Number(raw)
  }

  async delete(jti: string): Promise<void> {
    /**
     * 既に jti が無くても多重 delete で問題が起きないように、
     * userId 取得後に SREM + DEL をまとめて実行する。
     */
    const userIdRaw = await this._redis.get(keyOf(jti))
    if (userIdRaw === null) {
      await this._redis.del(keyOf(jti))
      return
    }
    await this._redis
      .multi()
      .del(keyOf(jti))
      .srem(userIndexKeyOf(Number(userIdRaw)), jti)
      .exec()
  }

  async deleteAllByUserId(userId: number): Promise<void> {
    const jtis = await this._redis.smembers(userIndexKeyOf(userId))
    if (jtis.length === 0) {
      await this._redis.del(userIndexKeyOf(userId))
      return
    }
    await this._redis.del(...jtis.map(keyOf), userIndexKeyOf(userId))
  }
}
