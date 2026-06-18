import { promises as fs } from "node:fs"
import { dirname, join } from "node:path"

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
    const fullPath = join(this._baseDir, filename)
    /**
     * filename にサブディレクトリ (例: "special-badges/123-hof.png") が含まれる場合、
     * baseDir だけ mkdir しても親ディレクトリが無く writeFile が ENOENT で失敗する。
     * filename のディレクトリ階層も含めて mkdir -p する
     */
    await fs.mkdir(dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, buffer)
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
