import { comboToReward, detectBonuses, totalBonusSec } from "../../src/lib/combo-time-bonus"

describe("comboToReward", () => {
  describe("正常系", () => {
    it("combo 30 で +1 秒", () => {
      expect(comboToReward(30)).toBe(1)
    })

    it("combo 60 で +2 秒", () => {
      expect(comboToReward(60)).toBe(2)
    })

    it("combo 90, 120, 150, 180, 300 でいずれも +3 秒", () => {
      expect(comboToReward(90)).toBe(3)
      expect(comboToReward(120)).toBe(3)
      expect(comboToReward(150)).toBe(3)
      expect(comboToReward(180)).toBe(3)
      expect(comboToReward(300)).toBe(3)
    })
  })

  describe("異常系", () => {
    it("マイルストーンでない combo は null", () => {
      expect(comboToReward(0)).toBeNull()
      expect(comboToReward(1)).toBeNull()
      expect(comboToReward(29)).toBeNull()
      expect(comboToReward(31)).toBeNull()
      expect(comboToReward(59)).toBeNull()
      expect(comboToReward(61)).toBeNull()
    })

    it("30 の倍数でも 90 未満で 60 でないものは null", () => {
      /** combo 30 / 60 はそれぞれ専用ルールで発火、それ以外の <90 の 30 倍数は存在しない */
      expect(comboToReward(0)).toBeNull()
    })

    it("90 以降でも 30 の倍数でなければ null", () => {
      expect(comboToReward(100)).toBeNull()
      expect(comboToReward(110)).toBeNull()
      expect(comboToReward(130)).toBeNull()
    })

    it("負の combo は null", () => {
      expect(comboToReward(-1)).toBeNull()
      expect(comboToReward(-30)).toBeNull()
    })
  })
})

describe("detectBonuses", () => {
  describe("正常系", () => {
    it("空ログは空配列を返す", () => {
      expect(detectBonuses([])).toEqual([])
    })

    it("combo 30 達成で 1 イベント発火する", () => {
      const logs = Array.from({ length: 30 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      expect(detectBonuses(logs)).toEqual([
        { addedSec: 1, elapsedMs: 3000, milestoneCombo: 30 },
      ])
    })

    it("combo 90 達成で 30 / 60 / 90 の 3 イベントが順に発火する", () => {
      const logs = Array.from({ length: 90 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      expect(detectBonuses(logs)).toEqual([
        { addedSec: 1, elapsedMs: 3000, milestoneCombo: 30 },
        { addedSec: 2, elapsedMs: 6000, milestoneCombo: 60 },
        { addedSec: 3, elapsedMs: 9000, milestoneCombo: 90 },
      ])
    })

    it("combo 150 達成で 30 / 60 / 90 / 120 / 150 の 5 イベントが発火する (90 以降は 30 ごと +3)", () => {
      const logs = Array.from({ length: 150 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      const events = detectBonuses(logs)
      expect(events).toHaveLength(5)
      expect(events.map((e) => e.milestoneCombo)).toEqual([30, 60, 90, 120, 150])
      expect(events.map((e) => e.addedSec)).toEqual([1, 2, 3, 3, 3])
    })
  })

  describe("異常系", () => {
    it("途中で miss すると combo が 0 にリセットされる", () => {
      const logs = [
        ...Array.from({ length: 15 }, (_, i) => ({ elapsedMs: (i + 1) * 100, isCorrect: true })),
        { elapsedMs: 1600, isCorrect: false },
        ...Array.from({ length: 30 }, (_, i) => ({ elapsedMs: 1700 + i * 100, isCorrect: true })),
      ]
      /** miss 後に 30 文字正解 → combo 30 達成で 1 イベント */
      expect(detectBonuses(logs)).toEqual([
        { addedSec: 1, elapsedMs: 4600, milestoneCombo: 30 },
      ])
    })

    it("リセット後に同じマイルストーンへ再到達すると再び発火する (毎回加算・上限なし)", () => {
      const logs = [
        ...Array.from({ length: 30 }, (_, i) => ({ elapsedMs: (i + 1) * 100, isCorrect: true })),
        { elapsedMs: 3100, isCorrect: false },
        ...Array.from({ length: 30 }, (_, i) => ({ elapsedMs: 3200 + i * 100, isCorrect: true })),
      ]
      /** 1 回目の combo 30 と、リセット後 2 回目の combo 30 の両方で発火する */
      expect(detectBonuses(logs)).toEqual([
        { addedSec: 1, elapsedMs: 3000, milestoneCombo: 30 },
        { addedSec: 1, elapsedMs: 6100, milestoneCombo: 30 },
      ])
    })

    it("マイルストーン到達前に miss してもイベントは発火しない", () => {
      const logs = [
        ...Array.from({ length: 29 }, (_, i) => ({ elapsedMs: (i + 1) * 100, isCorrect: true })),
        { elapsedMs: 3000, isCorrect: false },
      ]
      expect(detectBonuses(logs)).toEqual([])
    })
  })
})

describe("totalBonusSec", () => {
  describe("正常系", () => {
    it("空配列は 0 秒", () => {
      expect(totalBonusSec([])).toBe(0)
    })

    it("累積延長秒数を合計する", () => {
      const events = [
        { addedSec: 1, elapsedMs: 3000, milestoneCombo: 30 },
        { addedSec: 2, elapsedMs: 6000, milestoneCombo: 60 },
        { addedSec: 3, elapsedMs: 9000, milestoneCombo: 90 },
      ]
      expect(totalBonusSec(events)).toBe(6)
    })

    it("combo 150 まで取った場合 1+2+3+3+3 = 12 秒", () => {
      const logs = Array.from({ length: 150 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      expect(totalBonusSec(detectBonuses(logs))).toBe(12)
    })
  })
})
