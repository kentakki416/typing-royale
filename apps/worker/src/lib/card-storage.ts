import { promises as fs } from "node:fs"
import { dirname, join } from "node:path"

/**
 * 生成した PNG を保存するストレージ抽象。
 *
 * apps/api の CardStorage と同じ役割だが、worker は save のみ必要。
 * MVP は LocalCardStorage (filesystem)、本番 S3 対応は別 PR。
 */
export interface CardStorage {
    /** PNG を保存して公開 URL を返す */
    save(filename: string, buffer: Buffer): Promise<string>
}

/**
 * ローカル filesystem 実装。`baseDir` 直下に PNG を保存し、`publicUrlPrefix` 経由で
 * apps/api の Express static 配信が返す。worker と api は同じ `REWARDS_CACHE_DIR` を
 * 共有する想定（worker が書き、api が配信する）。
 */
export class LocalCardStorage implements CardStorage {
  private _baseDir: string
  private _publicUrlPrefix: string

  constructor(baseDir: string, publicUrlPrefix: string) {
    this._baseDir = baseDir
    this._publicUrlPrefix = publicUrlPrefix
  }

  public async save(filename: string, buffer: Buffer): Promise<string> {
    const fullPath = join(this._baseDir, filename)
    /**
     * filename にサブディレクトリ (例: "special-badges/123-hof.png") が含まれる場合、
     * 親ディレクトリも含めて mkdir -p しないと writeFile が ENOENT で失敗する。
     */
    await fs.mkdir(dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, buffer)
    return `${this._publicUrlPrefix}/${filename}`
  }
}
