import Redis from "ioredis"

export const redis = new Redis({
  db: Number(process.env.REDIS_DB) || 0,
  host: process.env.REDIS_HOST || "localhost",
  password: process.env.REDIS_PASSWORD || undefined,
  port: Number(process.env.REDIS_PORT) || 6379,
})
