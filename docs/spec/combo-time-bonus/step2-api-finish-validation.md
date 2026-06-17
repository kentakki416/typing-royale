# step2: `/finish` でのサーバー側不正検証

クライアントから送信された `keystroke_logs` を時系列で再生して combo マイルストーン達成タイミングを再計算し、「許容 elapsed_ms 上限」を超える打鍵が 1 件でも含まれていればリクエスト全体を 400 BadRequest で reject する。

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

const BASE_SESSION_DURATION_MS = 120_000
/** ネットワーク／rAF 揺れを吸収するためのバッファ */
const ELAPSED_MS_TOLERANCE_MS = 500

const computeServerAggregate = async (
  input: ComputeServerAggregateInput,
  repo: ComputeServerAggregateRepo,
): Promise<Result<ComputeServerAggregateOutput>> => {
  /**
   * 1. combo マイルストーン発火を log から再現
   *    → 累積延長秒数 = 許容 elapsed_ms 上限の動的計算
   */
  const bonusEvents = detectBonuses(input.keystrokeLogs)
  const totalBonusMs = totalBonusSec(bonusEvents) * 1000
  const maxAllowedElapsedMs =
    BASE_SESSION_DURATION_MS + totalBonusMs + ELAPSED_MS_TOLERANCE_MS

  /**
   * 2. 許容上限を超える打鍵が 1 件でも含まれていればリクエスト全体を 400 で reject
   *    （filter で破棄せず、即 return badRequestError パターン）
   */
  const maxLogElapsedMs = input.keystrokeLogs.reduce(
    (acc, e) => Math.max(acc, e.elapsedMs),
    0,
  )
  if (maxLogElapsedMs > maxAllowedElapsedMs) {
    return err(
      badRequestError(
        `keystrokeLogs contains elapsed_ms (${maxLogElapsedMs}) exceeding allowed max (${maxAllowedElapsedMs})`,
      ),
    )
  }

  /**
   * 3. 既存の打鍵 → 文字列マッチング → スコア計算ロジックをそのまま実行
   */
  // ...既存の集計ロジックを input.keystrokeLogs に対して実行...
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
    it("combo 30 達成で許容 elapsed_ms が +1 秒される", async () => {
      const logs: KeystrokeLogs = [
        ...Array.from({ length: 30 }, (_, i) => ({
          elapsedMs: (i + 1) * 100,
          inputChar: "a",
          isCorrect: true,
          problemIndex: 0,
        })),
        /** 120_500 ms = 旧仕様なら out of range だが、+1s で 121_000 + tolerance が許容 */
        { elapsedMs: 120_500, inputChar: "b", isCorrect: true, problemIndex: 0 },
      ]
      const result = await finishSession(
        { accuracy: 1, keystrokeLogs: logs, sessionId: "...", typedChars: 31 },
        buildRepoCollection(),
      )
      expect(result.ok).toBe(true)
      /** 121_500 ms 以内の打鍵がすべてスコアに含まれている */
    })
  })

  describe("異常系", () => {
    it("combo マイルストーン未達成で長時間打鍵した log は 400 BadRequest で reject される", async () => {
      /** combo 29 までしか達成していないのに 130 秒経過した打鍵を含む log */
      const logs: KeystrokeLogs = [
        ...Array.from({ length: 29 }, (_, i) => ({
          elapsedMs: (i + 1) * 100,
          inputChar: "a",
          isCorrect: true,
          problemIndex: 0,
        })),
        /** combo 30 達成しないまま 130 秒の打鍵 → 許容上限は 120s + tolerance のまま、リクエスト全体が reject */
        { elapsedMs: 130_000, inputChar: "b", isCorrect: true, problemIndex: 0 },
      ]
      const result = await finishSession(
        { accuracy: 1, keystrokeLogs: logs, sessionId: "...", typedChars: 30 },
        buildRepoCollection(),
      )
      /** リクエスト全体が 400 BadRequest で reject される */
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe("bad_request")
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
