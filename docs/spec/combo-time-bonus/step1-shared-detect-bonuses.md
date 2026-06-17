# step1: 共有判定ロジック `detectBonuses` の追加

combo マイルストーン (30 / 60 / 90 / 120 / 150 / ...) を keystroke_logs から検出して `BonusEvent[]` を返す純粋関数を、フロント・サーバーの両方から使えるよう **2 箇所に同じロジックを配置** する。MVP では `@repo/*` 共通パッケージ化までは行わず、両側のユニットテストで挙動一致を担保する。

## 対応内容

### 1. apps/web 側

`apps/web/src/libs/combo-time-bonus.ts` を新規作成：

```typescript
/**
 * combo マイルストーン到達 → 加算秒数のマッピング
 * - combo 30: +1
 * - combo 60: +2
 * - combo 90 以降の 30 combo ごと: +3
 */
export const comboToReward = (combo: number): number | null => {
  if (combo === 30) return 1
  if (combo === 60) return 2
  if (combo >= 90 && combo % 30 === 0) return 3
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
  if (combo === 30) return 1
  if (combo === 60) return 2
  if (combo >= 90 && combo % 30 === 0) return 3
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

### apps/api 側 ユニットテスト

web 側のユニットテストは未配置。テストは `apps/api/test/lib/combo-time-bonus.test.ts` のみ。

```typescript
import { describe, expect, it } from "vitest"

import { comboToReward, detectBonuses, totalBonusSec } from "../../src/lib/combo-time-bonus"

describe("comboToReward", () => {
  describe("正常系", () => {
    it("combo 30 で +1 秒", () => {
      expect(comboToReward(30)).toBe(1)
    })

    it("combo 60 で +2 秒", () => {
      expect(comboToReward(60)).toBe(2)
    })

    it("combo 90, 120, 150, 180 でいずれも +3 秒", () => {
      expect(comboToReward(90)).toBe(3)
      expect(comboToReward(120)).toBe(3)
      expect(comboToReward(150)).toBe(3)
      expect(comboToReward(180)).toBe(3)
    })

    it("マイルストーン以外は null", () => {
      expect(comboToReward(0)).toBeNull()
      expect(comboToReward(29)).toBeNull()
      expect(comboToReward(31)).toBeNull()
      expect(comboToReward(75)).toBeNull()  // 30 の倍数ではない
      expect(comboToReward(100)).toBeNull() // 30 の倍数ではない
    })
  })
})

describe("detectBonuses", () => {
  describe("正常系", () => {
    it("空ログは空配列を返す", () => {
      expect(detectBonuses([])).toEqual([])
    })

    it("combo 30 達成で 1 イベント発火", () => {
      const logs = Array.from({ length: 30 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      const events = detectBonuses(logs)
      expect(events).toEqual([
        { addedSec: 1, elapsedMs: 3000, milestoneCombo: 30 },
      ])
    })

    it("combo 90 達成で 3 イベント発火 (30/60/90)", () => {
      const logs = Array.from({ length: 90 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      const events = detectBonuses(logs)
      expect(events).toEqual([
        { addedSec: 1, elapsedMs: 3000, milestoneCombo: 30 },
        { addedSec: 2, elapsedMs: 6000, milestoneCombo: 60 },
        { addedSec: 3, elapsedMs: 9000, milestoneCombo: 90 },
      ])
    })
  })

  describe("異常系", () => {
    it("途中で miss してリセット→再度 30 達成しても 2 度目は発火しない", () => {
      const logs = [
        ...Array.from({ length: 30 }, (_, i) => ({ elapsedMs: (i + 1) * 100, isCorrect: true })),
        { elapsedMs: 3100, isCorrect: false },
        ...Array.from({ length: 30 }, (_, i) => ({ elapsedMs: 3200 + i * 100, isCorrect: true })),
      ]
      const events = detectBonuses(logs)
      expect(events).toHaveLength(1)
      expect(events[0]?.milestoneCombo).toBe(30)
    })

    it("miss で combo が 0 に戻ること", () => {
      const logs = [
        ...Array.from({ length: 10 }, (_, i) => ({ elapsedMs: (i + 1) * 100, isCorrect: true })),
        { elapsedMs: 1100, isCorrect: false },
        ...Array.from({ length: 30 }, (_, i) => ({ elapsedMs: 1200 + i * 100, isCorrect: true })),
      ]
      const events = detectBonuses(logs)
      /** miss 後に再び 30 打鍵で combo 30 達成 → 1 回発火 */
      expect(events).toHaveLength(1)
    })
  })
})

describe("totalBonusSec", () => {
  it("累積延長秒数を合計する", () => {
    const events = [
      { addedSec: 1, elapsedMs: 3000, milestoneCombo: 30 },
      { addedSec: 2, elapsedMs: 6000, milestoneCombo: 60 },
      { addedSec: 3, elapsedMs: 9000, milestoneCombo: 90 },
    ]
    expect(totalBonusSec(events)).toBe(6)
  })
})
```

### 動作確認コマンド

```bash
pnpm --filter api test combo-time-bonus
```

test スイートが全 PASS することを確認する。
