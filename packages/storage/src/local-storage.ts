import { promises as fs } from "node:fs"
import { dirname, join } from "node:path"

import type { Storage } from "./storage"

/**
 * ローカル filesystem 実装。`baseDir` 直下に保存し、`publicUrlPrefix` 経由で配信させる。
 * 書き込み側と配信側が同じ filesystem を共有できるローカル開発向け
 * （本番の別コンテナ構成では S3Storage を使う）。
 */
export class LocalStorage implements Storage {
  private _baseDir: string
  private _publicUrlPrefix: string

  constructor(baseDir: string, publicUrlPrefix: string) {
    this._baseDir = baseDir
    this._publicUrlPrefix = publicUrlPrefix
  }

  async save(key: string, body: Buffer): Promise<string> {
    const fullPath = join(this._baseDir, key)
    /**
     * key にサブディレクトリ (例: "special-badges/123-hof.png") が含まれる場合、
     * 親ディレクトリも含めて mkdir -p しないと writeFile が ENOENT で失敗する。
     */
    await fs.mkdir(dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, body)
    return `${this._publicUrlPrefix}/${key}`
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(join(this._baseDir, key))
    } catch (err) {
      /** ファイルが既に無い場合は無視 (二重削除等) */
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
  }
}
