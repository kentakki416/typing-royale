# step1: 共有判定ロジック `detectBonuses` の追加

combo マイルストーン (20 / 40 / 60 / 80 / 100 / ...) を keystroke_logs から検出して `BonusEvent[]` を返す純粋関数を、フロント・サーバーの両方から使えるよう **2 箇所に同じロジックを配置** する。MVP では `@repo/*` 共通パッケージ化までは行わず、両側のユニットテストで挙動一致を担保する。

## 対応内容

### 1. apps/web 側

`apps/web/src/libs/combo-time-bonus.ts` を新規作成：

```typescript
/**
 * combo マイルストーン到達 → 加算秒数のマッピング
 * - combo 20: +1
 * - combo 40: +2
 * - combo 60 以降の 20 combo ごと: +3
 */
export const comboToReward = (combo: number): number | null => {
  if (combo === 20) return 1
  if (combo === 40) return 2
  if (combo >= 60 && combo % 20 === 0) return 3
  return null
}

export type BonusEvent = {
  /** マイルストーン到達した瞬間の elapsed_ms */
  elapsedMs: number
  /** 加算された秒数 (1 / 2 / 3) */
  addedSec: number
  /** 何 combo で発火したか (= マイルストーン値そのもの) */
  milestoneCombo: number
}

type Log = {
  elapsed_ms: number
  is_correct: boolean
}

/**
 * keystroke_logs を時系列に再生して combo を集計し、各マイルストーンの発火を検出する。
 *
 * 同じマイルストーンは 1 セッション 1 回のみ発火（ミスでリセット後に再度同じ combo に
 * 戻っても無視）。判定は決定論的でフロント・サーバーの双方で同じ結果を返す
 */
export const detectBonuses = (logs: ReadonlyArray<Log>): BonusEvent[] => {
  const events: BonusEvent[] = []
  const triggered = new Set<number>()
  let combo = 0
  for (const entry of logs) {
    if (entry.is_correct) {
      combo += 1
      const reward = comboToReward(combo)
      if (reward !== null && !triggered.has(combo)) {
        triggered.add(combo)
        events.push({ addedSec: reward, elapsedMs: entry.elapsed_ms, milestoneCombo: combo })
      }
    } else {
      combo = 0
    }
  }
  return events
}

/**
 * 累積延長秒数を集計（許容 elapsed_ms 上限の算出用）
 */
export const totalBonusSec = (events: ReadonlyArray<BonusEvent>): number =>
  events.reduce((acc, e) => acc + e.addedSec, 0)
```

### 2. apps/api 側

`apps/api/src/lib/combo-time-bonus.ts` を新規作成（同じロジック、`Log` 型の `is_correct` プロパティ名のみ camelCase の場合 `isCorrect` に揃える）：

```typescript
/**
 * apps/web/src/libs/combo-time-bonus.ts と同一ロジック。
 * ロジック変更時は両方を必ず一致させること。両側のユニットテストで挙動一致を担保する。
 * 入力型は Domain 型 (camelCase) を期待する
 */

export const comboToReward = (combo: number): number | null => {
  if (combo === 20) return 1
  if (combo === 40) return 2
  if (combo >= 60 && combo % 20 === 0) return 3
  return null
}

export type BonusEvent = {
  elapsedMs: number
  addedSec: number
  milestoneCombo: number
}

type Log = {
  elapsedMs: number
  isCorrect: boolean
}

export const detectBonuses = (logs: ReadonlyArray<Log>): BonusEvent[] => {
  const events: BonusEvent[] = []
  const triggered = new Set<number>()
  let combo = 0
  for (const entry of logs) {
    if (entry.isCorrect) {
      combo += 1
      const reward = comboToReward(combo)
      if (reward !== null && !triggered.has(combo)) {
        triggered.add(combo)
        events.push({ addedSec: reward, elapsedMs: entry.elapsedMs, milestoneCombo: combo })
      }
    } else {
      combo = 0
    }
  }
  return events
}

export const totalBonusSec = (events: ReadonlyArray<BonusEvent>): number =>
  events.reduce((acc, e) => acc + e.addedSec, 0)
```

## 動作確認

### apps/web 側 ユニットテスト

`apps/web/src/libs/combo-time-bonus.test.ts` を新規作成：

```typescript
import { describe, expect, it } from "vitest"

import { comboToReward, detectBonuses, totalBonusSec } from "./combo-time-bonus"

describe("comboToReward", () => {
  describe("正常系", () => {
    it("combo 20 で +1 秒", () => {
      expect(comboToReward(20)).toBe(1)
    })

    it("combo 40 で +2 秒", () => {
      expect(comboToReward(40)).toBe(2)
    })

    it("combo 60, 80, 100, 120 でいずれも +3 秒", () => {
      expect(comboToReward(60)).toBe(3)
      expect(comboToReward(80)).toBe(3)
      expect(comboToReward(100)).toBe(3)
      expect(comboToReward(120)).toBe(3)
    })

    it("マイルストーン以外は null", () => {
      expect(comboToReward(0)).toBeNull()
      expect(comboToReward(19)).toBeNull()
      expect(comboToReward(21)).toBeNull()
      expect(comboToReward(50)).toBeNull()  // 20 の倍数だが 60 未満で 40 でもない
      expect(comboToReward(70)).toBeNull()  // 20 の倍数ではない
    })
  })
})

describe("detectBonuses", () => {
  describe("正常系", () => {
    it("空ログは空配列を返す", () => {
      expect(detectBonuses([])).toEqual([])
    })

    it("combo 20 達成で 1 イベント発火", () => {
      const logs = Array.from({ length: 20 }, (_, i) => ({
        elapsed_ms: (i + 1) * 100,
        is_correct: true,
      }))
      const events = detectBonuses(logs)
      expect(events).toEqual([
        { addedSec: 1, elapsedMs: 2000, milestoneCombo: 20 },
      ])
    })

    it("combo 60 達成で 3 イベント発火 (20/40/60)", () => {
      const logs = Array.from({ length: 60 }, (_, i) => ({
        elapsed_ms: (i + 1) * 100,
        is_correct: true,
      }))
      const events = detectBonuses(logs)
      expect(events).toEqual([
        { addedSec: 1, elapsedMs: 2000, milestoneCombo: 20 },
        { addedSec: 2, elapsedMs: 4000, milestoneCombo: 40 },
        { addedSec: 3, elapsedMs: 6000, milestoneCombo: 60 },
      ])
    })
  })

  describe("異常系", () => {
    it("途中で miss してリセット→再度 20 達成しても 2 度目は発火しない", () => {
      const logs = [
        ...Array.from({ length: 20 }, (_, i) => ({ elapsed_ms: (i + 1) * 100, is_correct: true })),
        { elapsed_ms: 2100, is_correct: false },
        ...Array.from({ length: 20 }, (_, i) => ({ elapsed_ms: 2200 + i * 100, is_correct: true })),
      ]
      const events = detectBonuses(logs)
      expect(events).toHaveLength(1)
      expect(events[0]?.milestoneCombo).toBe(20)
    })

    it("miss で combo が 0 に戻ること", () => {
      const logs = [
        ...Array.from({ length: 10 }, (_, i) => ({ elapsed_ms: (i + 1) * 100, is_correct: true })),
        { elapsed_ms: 1100, is_correct: false },
        ...Array.from({ length: 20 }, (_, i) => ({ elapsed_ms: 1200 + i * 100, is_correct: true })),
      ]
      const events = detectBonuses(logs)
      /** miss 後に再び 20 打鍵で combo 20 達成 → 1 回発火 */
      expect(events).toHaveLength(1)
    })
  })
})

describe("totalBonusSec", () => {
  it("累積延長秒数を合計する", () => {
    const events = [
      { addedSec: 1, elapsedMs: 2000, milestoneCombo: 20 },
      { addedSec: 2, elapsedMs: 4000, milestoneCombo: 40 },
      { addedSec: 3, elapsedMs: 6000, milestoneCombo: 60 },
    ]
    expect(totalBonusSec(events)).toBe(6)
  })
})
```

### apps/api 側 ユニットテスト

`apps/api/test/lib/combo-time-bonus.test.ts` を作成（同じテストケースを camelCase の `isCorrect` / `elapsedMs` プロパティで）。

### 動作確認コマンド

```bash
pnpm --filter web test combo-time-bonus
pnpm --filter api test combo-time-bonus
```

両方の test スイートが全 PASS することを確認する。
