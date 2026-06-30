# step2: API 集計・生涯マージ・レスポンスを nested 化

サーバー集計（keystroke_logs 再生）と生涯統計マージ、`/api/user` の苦手文字整形を nested 構造に対応させる。タイピングエンジンの改修は不要（`inputChar` は既にログにある）。

## 対応内容

### 1. 集計ロジック（`apps/api/src/lib/score.ts`）

`aggregateMistypeStats` を nested 加算に変える。誤入力時に `expected` だけでなく `inputChar` も記録する。

```ts
export const aggregateMistypeStats = (
  logs: KeystrokeLogs,
  problemCodeBlocks: Map<number, string>,
): MistypeStats => {
  const mistypeStats: MistypeStats = {}
  const cursor = new Map<number, number>()
  for (const orderIndex of problemCodeBlocks.keys()) cursor.set(orderIndex, 0)

  for (const entry of logs) {
    const code = problemCodeBlocks.get(entry.problemIndex)
    if (!code) continue
    const pos = cursor.get(entry.problemIndex) ?? 0
    const expected = code[pos]
    if (expected === undefined) continue

    if (entry.inputChar === expected) {
      cursor.set(entry.problemIndex, pos + 1)
    } else {
      /** 期待文字 × 実際に打った文字 で二段カウント */
      mistypeStats[expected] ??= {}
      mistypeStats[expected][entry.inputChar] = (mistypeStats[expected][entry.inputChar] ?? 0) + 1
    }
  }
  return mistypeStats
}
```

> 既存のユニットテスト（`apps/api/test/lib/score.test.ts` 等）の期待値を nested に更新する。例：`{ l: 1 }` → `{ l: { k: 1 } }`。

### 2. 生涯統計マージ（`apps/api/src/repository/prisma/user-lifetime-stats-repository.ts`）

flat 加算（`newMistype[key] = ... + count`）を `mergeMistypeStats` + 正規化に置き換える。

```ts
import { mergeMistypeStats, normalizeMistypeStats } from "../../lib/mistype-stats"

/** 既存値は legacy flat の可能性があるので正規化してからネスト加算 */
const currentMistype = normalizeMistypeStats(existing.lifetimeMistypeStats)
const newMistype = mergeMistypeStats(currentMistype, input.mistypeStats)
```

`input.mistypeStats` は step2-1 の集計で既に nested。新規作成（`create`）側の初期値も nested の `input.mistypeStats` をそのまま保存する。

### 3. 苦手文字の整形（`apps/api/src/controller/user/get.ts`）

`toWeakChars` を「合計降順 top N」＋「各内訳 top M」に拡張する。

```ts
import { normalizeMistypeStats, totalMistypeCount } from "../../lib/mistype-stats"

const WEAK_CHARS_LIMIT = 10
const MISTYPED_BREAKDOWN_LIMIT = 3

const toWeakChars = (raw: unknown): { char: string; count: number; mistyped: { char: string; count: number }[] }[] => {
  const stats = normalizeMistypeStats(raw)
  return Object.entries(stats)
    .map(([char, inner]) => ({
      char,
      count: totalMistypeCount(inner),
      mistyped: Object.entries(inner)
        .sort(([, a], [, b]) => b - a)
        .slice(0, MISTYPED_BREAKDOWN_LIMIT)
        .map(([c, count]) => ({ char: c, count })),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, WEAK_CHARS_LIMIT)
}
```

`parseResponse(getUserResponseSchema, { ... weak_chars: toWeakChars(lifetime?.lifetimeMistypeStats) ... })` に差し替える。

### 4. finish / guest-finish レスポンス

`apps/api/src/controller/play-session/finish.ts` と `guest-finish.ts` の `mistype_stats: result.value.mistypeStats` はそのまま（中身が nested に変わるだけ）。スキーマ（step1）が nested を許すので `parseResponse` は通る。

### 5. ゲスト経路のサーバー受け取り

ゲストはクライアントが集計した `mistype_stats`（nested、step3 で対応）を送る。guest-finish のリクエストスキーマも step1 の `mistypeStatsSchema` を参照する形に揃える（既に参照していればフィールドの型が自動で nested になる）。`normalizeMistypeStats` を通して保存すると、旧クライアントからの flat 受信にも耐える。

## 動作確認

### Service ユニットテスト

- `aggregateMistypeStats`：`codeBlock="hello"` に対し `h e l k l o` を流し `{ l: { k: 1 } }` を返す（正常系）。末尾超過エントリは無視（異常系）。
- 生涯マージ：既存が legacy flat `{ l: 3 }`、入力が nested `{ l: { k: 1 } }` のとき `{ l: { "?": 3, k: 1 } }` になる（後方互換）。

### Controller インテグレーションテスト（`apps/api/test/controller/`）

`GET /api/user`：`user_lifetime_stats.lifetimeMistypeStats` に nested を直接 seed し、レスポンス `weak_chars` が

```ts
expect(res.body.weak_chars).toEqual([
  { char: "l", count: 3, mistyped: [{ char: "k", count: 2 }, { char: "o", count: 1 }] },
  // ...合計降順
])
```

になることを検証（`toEqual` で契約を固定）。legacy flat を seed したケースで `mistyped: [{ char: "?", count: N }]` になることも 1 ケース足す。

```bash
cd apps/api && pnpm test
```
