/**
 * combo マイルストーン到達時にプレイ時間を加算するロジック (純粋関数)。
 *
 * apps/api/src/lib/combo-time-bonus.ts と同一のルールを持つ。ロジック変更時は
 * 両方を必ず一致させること。仕様詳細は docs/spec/combo-time-bonus/ を参照。
 *
 * 入力型は web 側の snake_case な KeystrokeLog (= keystroke_logs スキーマ) を想定する
 */

/**
 * combo 数 → 加算秒数
 * - combo 30:                  +1
 * - combo 60:                  +2
 * - combo 90 以降の 30 combo ごと: +3
 * - それ以外:                  null (加算なし)
 *
 * 旧仕様 (20/40/60+ の 20 combo step) からゲーム時間が長すぎる問題への対処として
 * 閾値を 30 combo step に広げた。10 文字/秒以上のスピードを維持できる上級者には
 * 理論上 無限延長の可能性が残るが、現実的にはほぼ全プレイヤーで終了する
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
 * keystroke_logs を時系列に再生して各マイルストーンの発火イベントを検出する。
 *
 * - マイルストーンに達するたびに発火する（miss で combo 0 に戻った後、再び同じ combo
 *   に達すれば再び加算される＝何度でも取得可能・上限なし）
 * - 判定は決定論的でフロント・サーバーの双方で同じ結果を返す
 */
export const detectBonuses = (logs: ReadonlyArray<Log>): BonusEvent[] => {
  const events: BonusEvent[] = []
  let combo = 0
  for (const entry of logs) {
    if (entry.is_correct) {
      combo += 1
      const reward = comboToReward(combo)
      if (reward !== null) {
        events.push({ addedSec: reward, elapsedMs: entry.elapsed_ms, milestoneCombo: combo })
      }
    } else {
      combo = 0
    }
  }
  return events
}

/**
 * 累積延長秒数を集計 (許容 elapsed_ms 上限の算出用)
 */
export const totalBonusSec = (events: ReadonlyArray<BonusEvent>): number =>
  events.reduce((acc, e) => acc + e.addedSec, 0)
