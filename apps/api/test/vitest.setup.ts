/**
 * Vitest 共通セットアップ。テストモジュールの import より前に実行されるため、
 * 環境変数を参照する src/ 配下のモジュール（prisma.client.ts / redis.ts 等）が
 * 読み込まれる前に必要な値を確実に設定できる。
 *
 * 旧 Jest 構成では jest.config.js のトップレベルおよび test/controller/setup.ts の
 * 先頭で process.env を書き換えていたが、ESM 環境では import の hoist によって
 * その代入より先にモジュールが評価されるため、Vitest 側では setupFiles に集約する。
 */
process.env.LOGGER_TYPE = process.env.LOGGER_TYPE || "silent"
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-jwt-access-secret"
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret"
process.env.JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || "15m"
process.env.JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || "7d"

/**
 * Controller integration テストの接続先（テスト用 DB / Redis DB 1）。
 * 旧構成では test/controller/setup.ts の先頭で設定していたが、上記理由により
 * ここに移し、controller / service のどちらの実行でも同じ初期化が走るようにする。
 */
process.env.DB_NAME = process.env.DB_NAME || "project-template_test"
process.env.REDIS_DB = process.env.REDIS_DB || "1"
