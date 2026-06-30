# step1: スキーマ・ドメイン型を nested 構造に拡張

`mistypeStats` を flat（`Record<string, number>`）から nested（`Record<string, Record<string, number>>`）へ拡張する。DB は Json 列のため migration は不要。**正本の型定義と Zod スキーマ、後方互換の正規化関数** を用意するのがこの step のゴール。

## 対応内容

### 1. Zod スキーマ（`packages/schema/src/api-schema/play-session.ts`）

```ts
/**
 * mistype_stats のレスポンス形式
 * key=正解期待文字、value={ 実際に打った文字 → 誤打鍵回数 }
 */
const mistypeStatsSchema = z.record(
  z.string(),
  z.record(z.string(), z.number().int().nonnegative()),
)
```

### 2. 苦手文字スキーマ（`packages/schema/src/api-schema/user.ts`）

```ts
/**
 * 苦手文字 1 件（生涯通算の文字ごと誤打数 + 誤入力の内訳 top N）
 */
const weakCharSchema = z.object({
  char: z.string(),
  count: z.number().int().nonnegative(),
  mistyped: z.array(
    z.object({
      char: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
})
```

`getUserResponseSchema.weak_chars` の要素型がこれに差し替わる（フィールド名はそのまま `weak_chars`）。

### 3. ドメイン型（`apps/api/src/types/domain/play-session.ts`）

```ts
/** 期待文字 → 実際に打った文字 → 回数 */
export type MistypeStats = Record<string, Record<string, number>>
```

### 4. 正規化関数（`apps/api/src/lib/mistype-stats.ts` 新規）

legacy flat と nested の両方を受け取り nested に正規化する純関数。読み出し・マージ・バックフィルで共有する。

```ts
import type { MistypeStats } from "../types/domain"

/** 内訳が復元できない（legacy flat 由来）ことを表すキー */
export const UNKNOWN_ACTUAL = "?"

/**
 * 保存済み JSON（flat or nested の混在）を nested の MistypeStats に正規化する。
 * - value が number（旧 flat）→ { [UNKNOWN_ACTUAL]: number }
 * - value が object（新 nested）→ そのまま採用（数値以外は無視）
 */
export const normalizeMistypeStats = (raw: unknown): MistypeStats => {
  const result: MistypeStats = {}
  if (raw === null || typeof raw !== "object") return result
  for (const [expected, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number") {
      result[expected] = { [UNKNOWN_ACTUAL]: value }
    } else if (value !== null && typeof value === "object") {
      const inner: Record<string, number> = {}
      for (const [actual, count] of Object.entries(value as Record<string, unknown>)) {
        if (typeof count === "number") inner[actual] = count
      }
      result[expected] = inner
    }
  }
  return result
}

/** 期待文字 1 件の合計誤打数（内訳の総和） */
export const totalMistypeCount = (inner: Record<string, number>): number =>
  Object.values(inner).reduce((sum, n) => sum + n, 0)

/**
 * 2 つの nested stats を破壊せずマージ（バックフィル・生涯加算で共有）
 */
export const mergeMistypeStats = (base: MistypeStats, add: MistypeStats): MistypeStats => {
  const result: MistypeStats = structuredClone(base)
  for (const [expected, inner] of Object.entries(add)) {
    result[expected] ??= {}
    for (const [actual, count] of Object.entries(inner)) {
      result[expected][actual] = (result[expected][actual] ?? 0) + count
    }
  }
  return result
}
```

### 5. スキーマパッケージのビルド

```bash
cd packages/schema && pnpm build
```

## 動作確認

`apps/api/test/lib/mistype-stats.test.ts` を新規作成（CLAUDE.md のテスト分類：正常系 / 異常系）。

```ts
import { mergeMistypeStats, normalizeMistypeStats, totalMistypeCount } from "../../src/lib/mistype-stats"

describe("normalizeMistypeStats", () => {
  describe("正常系", () => {
    it("flat（number 値）を内訳不明の nested に変換する", () => {
      expect(normalizeMistypeStats({ l: 3 })).toEqual({ l: { "?": 3 } })
    })
    it("nested はそのまま採用する", () => {
      expect(normalizeMistypeStats({ l: { k: 2, o: 1 } })).toEqual({ l: { k: 2, o: 1 } })
    })
    it("flat と nested の混在を正規化できる", () => {
      expect(normalizeMistypeStats({ l: 3, ";": { "'": 5 } })).toEqual({
        l: { "?": 3 },
        ";": { "'": 5 },
      })
    })
  })
  describe("異常系", () => {
    it("null / 非オブジェクトは空を返す", () => {
      expect(normalizeMistypeStats(null)).toEqual({})
      expect(normalizeMistypeStats("x")).toEqual({})
    })
  })
})

describe("totalMistypeCount", () => {
  describe("正常系", () => {
    it("内訳の総和を返す", () => {
      expect(totalMistypeCount({ k: 2, o: 1 })).toBe(3)
    })
  })
})

describe("mergeMistypeStats", () => {
  describe("正常系", () => {
    it("期待文字 × 誤入力文字の二段で加算する", () => {
      expect(mergeMistypeStats({ l: { k: 2 } }, { l: { k: 1, o: 1 }, a: { s: 1 } })).toEqual({
        l: { k: 3, o: 1 },
        a: { s: 1 },
      })
    })
  })
})
```

```bash
cd apps/api && pnpm test test/lib/mistype-stats.test.ts
```
