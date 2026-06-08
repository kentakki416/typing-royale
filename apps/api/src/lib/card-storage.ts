import { promises as fs } from "node:fs"
import { join } from "node:path"

/**
 * 達成カード PNG を保存するストレージ抽象
 *
 * docs/spec/rewards/step6-api-and-web-achievement-cards.md「PNG ストレージ設計」参照。
 * MVP は LocalCardStorage (filesystem)、本番 S3 対応は別 PR
 */
export interface CardStorage {
    /**
     * PNG を保存して公開 URL を返す
     */
    save(filename: string, buffer: Buffer): Promise<string>

    /**
     * アカウント削除時に PNG を削除
     */
    delete(filename: string): Promise<void>
}

/**
 * ローカル filesystem 実装。`baseDir` 直下に PNG を保存し、`publicUrlPrefix` 経由で
 * Express の static 配信が返す
 */
export class LocalCardStorage implements CardStorage {
  private _baseDir: string
  private _publicUrlPrefix: string

  constructor(baseDir: string, publicUrlPrefix: string) {
    this._baseDir = baseDir
    this._publicUrlPrefix = publicUrlPrefix
  }

  async save(filename: string, buffer: Buffer): Promise<string> {
    await fs.mkdir(this._baseDir, { recursive: true })
    await fs.writeFile(join(this._baseDir, filename), buffer)
    return `${this._publicUrlPrefix}/${filename}`
  }

  async delete(filename: string): Promise<void> {
    try {
      await fs.unlink(join(this._baseDir, filename))
    } catch (err) {
      /**
       * ファイルが既に無い場合は無視 (アカウント二重削除等)
       */
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
  }
}
