# step1-api: GET /api/languages

言語マスタを全件返す公開エンドポイントを追加する。`apps/api/CLAUDE.md` のレイヤード（Repository → Service → Controller → Router → DI）に従う。

## 対応内容

### 1. スキーマ（`packages/schema`）

`packages/schema/src/api-schema/language.ts` を新規作成。命名規則は `packages/schema/CLAUDE.md` に従う。

```typescript
import { z } from "zod"

/**
 * 言語マスタ 1 件
 */
export const languageItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  slug: z.string().min(1),
})

/**
 * GET /api/languages のレスポンス
 */
export const getLanguagesResponseSchema = z.object({
  languages: z.array(languageItemSchema),
})

export type LanguageItem = z.infer<typeof languageItemSchema>
export type GetLanguagesResponse = z.infer<typeof getLanguagesResponseSchema>
```

`packages/schema/src/api-schema/index.ts` の barrel に追加し、`cd packages/schema && pnpm build`。

### 2. Repository（`LanguageRepository.findAll`）

`apps/api/src/repository/prisma/language-repository.ts` に `name` を含む型と `findAll()` を追加する。

```typescript
/**
 * 一覧表示用の Language（name を含む）
 */
export type LanguageListItem = {
  id: number
  name: string
  slug: string
}

export interface LanguageRepository {
  existsById(id: number): Promise<boolean>
  findAll(): Promise<LanguageListItem[]>   // ← 追加
  findById(id: number): Promise<LanguageRef | null>
  findBySlug(slug: string): Promise<LanguageRef | null>
}

// PrismaLanguageRepository に実装を追加
async findAll(): Promise<LanguageListItem[]> {
  return this._prisma.language.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, slug: true },
  })
}
```

### 3. Service（`service.language.listLanguages`）

`apps/api/src/service/language-service.ts` を新規作成。`export const` + `repo: { ... }` パターン。**読み取りのみで業務エラーは発生しない**ため常に `ok()` を返す。

```typescript
import { logger } from "@repo/logger"

import { LanguageListItem, LanguageRepository } from "../repository/prisma"
import { ok, Result } from "../types/result"

export const listLanguages = async (
  repo: { languageRepository: LanguageRepository },
): Promise<Result<LanguageListItem[]>> => {
  logger.debug("listLanguages: fetching all languages")
  const languages = await repo.languageRepository.findAll()
  return ok(languages)
}
```

`service/index.ts` に `export * as language from "./language-service"` を追加。

### 4. Controller（`LanguageListController`）

`apps/api/src/controller/language/list.ts`。`parseResponse` + `sendError` を使う。

```typescript
import { Request, Response } from "express"

import { getLanguagesResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { LanguageRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/languages
 * 言語マスタを id 昇順で全件返す。認証不要（公開）
 */
export class LanguageListController {
  constructor(private languageRepository: LanguageRepository) {}

  async execute(req: Request, res: Response) {
    logger.info("LanguageListController: listing languages")

    const result = await service.language.listLanguages({
      languageRepository: this.languageRepository,
    })
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getLanguagesResponseSchema, {
      languages: result.value,
    })
    return res.status(200).json(response)
  }
}
```

### 5. Router

`apps/api/src/routes/language-router.ts`。

```typescript
import { Router } from "express"

import { LanguageListController } from "../controller/language/list"

type LanguageRouterControllers = {
  list?: LanguageListController
}

export const languageRouter = (controllers: LanguageRouterControllers): Router => {
  const router = Router()
  if (controllers.list) {
    router.get("/", (req, res) => controllers.list!.execute(req, res))
  }
  return router
}
```

### 6. DI + 公開パス（`apps/api/src/index.ts`）

- `LanguageListController` を組み立て、`app.use("/api/languages", languageRouter({ list: ... }))` を登録。
- **認証不要**にする。`/api/crawled-repos` と同じ方法で API 側の公開パス（auth middleware の許可リスト）に `/api/languages` を追加する（crawled-repo の登録箇所を参照）。

## 動作確認

`apps/api/CLAUDE.md` のテスト戦略に従う。

### Service ユニットテスト（`test/service/language-service.test.ts`）

```typescript
describe("listLanguages", () => {
  describe("正常系", () => {
    it("findAll の結果をそのまま ok で返す", async () => {
      const languageRepository = {
        existsById: vi.fn(),
        findAll: vi.fn<() => Promise<LanguageListItem[]>>().mockResolvedValue([
          { id: 1, name: "TypeScript", slug: "typescript" },
        ]),
        findById: vi.fn(),
        findBySlug: vi.fn(),
      }
      const result = await listLanguages({ languageRepository })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toHaveLength(1)
    })

    it("0 件のとき空配列を ok で返す", async () => {
      // findAll → [] → ok([])
    })
  })
})
```

### Controller インテグレーションテスト（`test/controller/language/list.test.ts`）

- 実 Postgres を使う。`beforeEach` で `cleanupTestData()` 後に `language` を 2 件投入。
- `GET /api/languages` → 200、`res.body` を `toEqual` で完全一致検証（`{ languages: [{ id: any, name, slug }, ...] }`）。
- 認証なしで 200 が返る（公開エンドポイント）ことを確認。

### 手動確認

```bash
curl -s http://localhost:8080/api/languages | jq
# { "languages": [ { "id":1,"name":"TypeScript","slug":"typescript" }, ... ] }
```
