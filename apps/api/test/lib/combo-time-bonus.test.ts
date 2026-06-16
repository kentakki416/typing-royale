import { comboToReward, detectBonuses, totalBonusSec } from "../../src/lib/combo-time-bonus"

describe("comboToReward", () => {
  describe("正常系", () => {
    it("combo 20 で +1 秒", () => {
      expect(comboToReward(20)).toBe(1)
    })

    it("combo 40 で +2 秒", () => {
      expect(comboToReward(40)).toBe(2)
    })

    it("combo 60, 80, 100, 120, 200 でいずれも +3 秒", () => {
      expect(comboToReward(60)).toBe(3)
      expect(comboToReward(80)).toBe(3)
      expect(comboToReward(100)).toBe(3)
      expect(comboToReward(120)).toBe(3)
      expect(comboToReward(200)).toBe(3)
    })
  })

  describe("異常系", () => {
    it("マイルストーンでない combo は null", () => {
      expect(comboToReward(0)).toBeNull()
      expect(comboToReward(1)).toBeNull()
      expect(comboToReward(19)).toBeNull()
      expect(comboToReward(21)).toBeNull()
      expect(comboToReward(39)).toBeNull()
      expect(comboToReward(41)).toBeNull()
    })

    it("20 の倍数でも 50 や 70 (60 未満 / 60 以降の 20 倍数でない) は null", () => {
      expect(comboToReward(50)).toBeNull()
      expect(comboToReward(70)).toBeNull()
      expect(comboToReward(90)).toBeNull()
    })

    it("負の combo は null", () => {
      expect(comboToReward(-1)).toBeNull()
      expect(comboToReward(-20)).toBeNull()
    })
  })
})

describe("detectBonuses", () => {
  describe("正常系", () => {
    it("空ログは空配列を返す", () => {
      expect(detectBonuses([])).toEqual([])
    })

    it("combo 20 達成で 1 イベント発火する", () => {
      const logs = Array.from({ length: 20 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      expect(detectBonuses(logs)).toEqual([
        { addedSec: 1, elapsedMs: 2000, milestoneCombo: 20 },
      ])
    })

    it("combo 60 達成で 20 / 40 / 60 の 3 イベントが順に発火する", () => {
      const logs = Array.from({ length: 60 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      expect(detectBonuses(logs)).toEqual([
        { addedSec: 1, elapsedMs: 2000, milestoneCombo: 20 },
        { addedSec: 2, elapsedMs: 4000, milestoneCombo: 40 },
        { addedSec: 3, elapsedMs: 6000, milestoneCombo: 60 },
      ])
    })

    it("combo 100 達成で 20 / 40 / 60 / 80 / 100 の 5 イベントが発火する (60 以降は 20 ごと +3)", () => {
      const logs = Array.from({ length: 100 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      const events = detectBonuses(logs)
      expect(events).toHaveLength(5)
      expect(events.map((e) => e.milestoneCombo)).toEqual([20, 40, 60, 80, 100])
      expect(events.map((e) => e.addedSec)).toEqual([1, 2, 3, 3, 3])
    })
  })

  describe("異常系", () => {
    it("途中で miss すると combo が 0 にリセットされる", () => {
      const logs = [
        ...Array.from({ length: 10 }, (_, i) => ({ elapsedMs: (i + 1) * 100, isCorrect: true })),
        { elapsedMs: 1100, isCorrect: false },
        ...Array.from({ length: 20 }, (_, i) => ({ elapsedMs: 1200 + i * 100, isCorrect: true })),
      ]
      /** miss 後に 20 文字正解 → combo 20 達成で 1 イベント */
      expect(detectBonuses(logs)).toEqual([
        { addedSec: 1, elapsedMs: 3100, milestoneCombo: 20 },
      ])
    })

    it("同じマイルストーンは 1 セッション 1 回のみ発火 (リセット後の再達成は無視)", () => {
      const logs = [
        ...Array.from({ length: 20 }, (_, i) => ({ elapsedMs: (i + 1) * 100, isCorrect: true })),
        { elapsedMs: 2100, isCorrect: false },
        ...Array.from({ length: 20 }, (_, i) => ({ elapsedMs: 2200 + i * 100, isCorrect: true })),
      ]
      /** 最初の combo 20 で発火、リセット後の 2 度目の combo 20 は発火しない */
      const events = detectBonuses(logs)
      expect(events).toHaveLength(1)
      expect(events[0]?.milestoneCombo).toBe(20)
      expect(events[0]?.elapsedMs).toBe(2000)
    })

    it("マイルストーン到達前に miss してもイベントは発火しない", () => {
      const logs = [
        ...Array.from({ length: 19 }, (_, i) => ({ elapsedMs: (i + 1) * 100, isCorrect: true })),
        { elapsedMs: 2000, isCorrect: false },
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
        { addedSec: 1, elapsedMs: 2000, milestoneCombo: 20 },
        { addedSec: 2, elapsedMs: 4000, milestoneCombo: 40 },
        { addedSec: 3, elapsedMs: 6000, milestoneCombo: 60 },
      ]
      expect(totalBonusSec(events)).toBe(6)
    })

    it("combo 100 まで取った場合 1+2+3+3+3 = 12 秒", () => {
      const logs = Array.from({ length: 100 }, (_, i) => ({
        elapsedMs: (i + 1) * 100,
        isCorrect: true,
      }))
      expect(totalBonusSec(detectBonuses(logs))).toBe(12)
    })
  })
})
