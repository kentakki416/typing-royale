import Redis from "ioredis"

/**
 * Redisのヘルスチェック用リポジトリのインターフェース
 */
export interface RedisHealthRepository {
  ping(): Promise<void>
}

/**
 * ioredis実装のRedisヘルスチェックリポジトリ
 */
export class IoRedisHealthRepository implements RedisHealthRepository {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  async ping(): Promise<void> {
    await this._redis.ping()
  }
}
