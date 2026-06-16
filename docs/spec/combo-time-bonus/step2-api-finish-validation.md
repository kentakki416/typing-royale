# step2: `/finish` でのサーバー側不正検証

クライアントから送信された `keystroke_logs` を時系列で再生して combo マイルストーン達成タイミングを再計算し、「許容 elapsed_ms 上限」を超える打鍵をサーバー側で破棄してからスコアを集計する。

これによりクライアントがタイマーを勝手に延長して長時間打鍵した不正データを弾く。

## 対応内容

### 1. packages/schema の制約緩和

`packages/schema/src/api-schema/play-session.ts`：

```typescript
/** 旧仕様: elapsed_ms に上限制約があれば撤去 */
export const keystrokeEntrySchema = z.object({
  elapsed_ms: z.number().int().nonnegative(),  // ← max(120_000) があれば削除
  input_char: z.string().min(1).max(20),
  is_correct: z.boolean(),
  problem_index: z.number().int().nonnegative(),
})
```

schema ビルド：

```bash
cd packages/schema && pnpm build
```

### 2. computeServerAggregate に検証ロジックを追加

`apps/api/src/service/play-session-service.ts` の `computeServerAggregate`（または同等の集計関数）に、combo ボーナス考慮の許容 elapsed_ms 検証を追加する。

```typescript
import { detectBonuses, totalBonusSec } from "../lib/combo-time-bonus"

const BASE_DURATION_MS = 120_000

const computeServerAggregate = async (
  input: ComputeServerAggregateInput,
  repo: ComputeServerAggregateRepo,
): Promise<Result<ComputeServerAggregateOutput>> => {
  /**
   * 1. combo マイルストーン発火を log から再現
   *    → 累積延長秒数 = 許容 elapsed_ms 上限の動的計算
   */
  const bonusEvents = detectBonuses(
    input.keystrokeLogs.map((e) => ({ elapsedMs: e.elapsedMs, isCorrect: e.isCorrect })),
  )
  const totalBonusMs = totalBonusSec(bonusEvents) * 1000
  const maxAllowedElapsedMs = BASE_DURATION_MS + totalBonusMs

  /**
   * 2. 許容上限を超える打鍵を破棄
   *    異常な elapsed_ms を持つ log はスコア計算から除外
   */
  const validLogs = input.keystrokeLogs.filter(
    (e) => e.elapsedMs <= maxAllowedElapsedMs,
  )

  /**
   * 3. 正規化された log から再集計
   *    既存の打鍵 → 文字列マッチング → スコア計算ロジックは validLogs を使う
   */
  // ...既存の集計ロジックを validLogs に対して実行...
}
```

### 3. 神々モード（ghost log）の elapsed_ms 検証は **行わない**

ghost log は **既に DB に永続化された過去セッションの記録**なので、現行プレイの不正対策とは別軸。ghost log は信頼して再生する。

## 動作確認

### Service ユニットテスト

`apps/api/test/service/play-session-service/finish-session.test.ts` に追加：

```typescript
describe("finishSession (combo time bonus 検証)", () => {
  describe("正常系", () => {
    it("combo 20 達成で許容 elapsed_ms が +1 秒される", async () => {
      const logs: KeystrokeLogs = [
        ...Array.from({ length: 20 }, (_, i) => ({
          elapsedMs: (i + 1) * 100,
          inputChar: "a",
          isCorrect: true,
          problemIndex: 0,
        })),
        /** 120_500 ms = 旧仕様なら out of range だが、+1s で 121_000 が許容 */
        { elapsedMs: 120_500, inputChar: "b", isCorrect: true, problemIndex: 0 },
      ]
      const result = await finishSession(
        { accuracy: 1, keystrokeLogs: logs, sessionId: "...", typedChars: 21 },
        buildRepoCollection(),
      )
      expect(result.ok).toBe(true)
      /** 121_000 ms 以内の打鍵がすべてスコアに含まれている */
    })
  })

  describe("異常系", () => {
    it("combo マイルストーン未達成で長時間打鍵した log は超過分が破棄される", async () => {
      /** combo 19 までしか達成していないのに 130 秒経過した打鍵を含む log */
      const logs: KeystrokeLogs = [
        ...Array.from({ length: 19 }, (_, i) => ({
          elapsedMs: (i + 1) * 100,
          inputChar: "a",
          isCorrect: true,
          problemIndex: 0,
        })),
        /** combo 20 達成しないまま 130 秒の打鍵 → 許容上限は 120s のまま、破棄される */
        { elapsedMs: 130_000, inputChar: "b", isCorrect: true, problemIndex: 0 },
      ]
      const result = await finishSession(
        { accuracy: 1, keystrokeLogs: logs, sessionId: "...", typedChars: 20 },
        buildRepoCollection(),
      )
      /** スコア = 破棄後の正解打鍵数 (19 件) ベース */
      expect(result.ok).toBe(true)
      if (result.ok) {
        /** 不正打鍵は除外されているので、サーバー再計算の score / typed_chars は 19 ベース */
        expect(result.value.typedChars).toBeLessThanOrEqual(19)
      }
    })
  })
})
```

### Controller integration テスト

`apps/api/test/controller/play-session/finish.test.ts` に「combo ボーナス込みの elapsed_ms を含むペイロード」を投げて 200 が返ることを確認。

### 動作確認コマンド

```bash
pnpm --filter api test finish-session
pnpm --filter api test finish.test
```
