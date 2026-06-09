/**
 * プレイ画面用の Web Audio API ベース SE ジェネレータ
 *
 * mp3 / wav ファイルは持たず、`OscillatorNode` でリアルタイム生成する。
 * 各 SE は数十 ms 程度の短いトーンで、軽量・著作権フリー・ユーザーごとの
 * 主観差が出にくい。AudioContext はブラウザポリシーで「ユーザー操作後」に
 * 初期化される必要があるので、初回 keydown で lazy-init する
 */

let cachedContext: AudioContext | null = null

const getContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null
  if (cachedContext !== null) return cachedContext
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  cachedContext = new Ctx()
  return cachedContext
}

type PlayBeepOptions = {
  /**
   * 基本周波数 (Hz)
   */
  frequency: number
  /**
   * 鳴動時間 (秒)
   */
  duration?: number
  /**
   * 音色
   */
  type?: OscillatorType
  /**
   * 音量 (0.0 〜 1.0)
   */
  volume?: number
  /**
   * 終了時の周波数（指定すると linear ramp で変化）。tier アップ等の上昇音に使う
   */
  endFrequency?: number
}

const playBeep = ({
  duration = 0.06,
  endFrequency,
  frequency,
  type = "sine",
  volume = 0.05,
}: PlayBeepOptions) => {
  const ctx = getContext()
  if (!ctx) return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, now)
  if (endFrequency !== undefined) {
    osc.frequency.linearRampToValueAtTime(endFrequency, now + duration)
  }
  /** クリックノイズ防止のため attack / release を envelope で短く付ける */
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.005)
  gain.gain.linearRampToValueAtTime(0, now + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + duration + 0.01)
}

/**
 * 正解打鍵時の短い chime (高め sine)
 */
export const playKeyHit = () => {
  playBeep({ duration: 0.04, frequency: 880, type: "sine", volume: 0.025 })
}

/**
 * 誤打鍵時の buzz (低め square)
 */
export const playKeyMiss = () => {
  playBeep({ duration: 0.08, frequency: 140, type: "square", volume: 0.04 })
}

/**
 * tier アップ時の上昇音 (5 度 → 8 度の sweep)
 */
export const playTierUp = () => {
  playBeep({ duration: 0.25, endFrequency: 1320, frequency: 660, type: "triangle", volume: 0.08 })
}

/**
 * 残り 10 秒切り時の urgent beep (1 回)
 */
export const playUrgentTick = () => {
  playBeep({ duration: 0.08, frequency: 440, type: "square", volume: 0.06 })
}

/**
 * /finish 直後のファンファーレ (3 音重ね)
 */
export const playFinish = () => {
  const ctx = getContext()
  if (!ctx) return
  playBeep({ duration: 0.18, frequency: 523, type: "triangle", volume: 0.07 })
  setTimeout(() => playBeep({ duration: 0.18, frequency: 659, type: "triangle", volume: 0.07 }), 100)
  setTimeout(() => playBeep({ duration: 0.32, frequency: 784, type: "triangle", volume: 0.08 }), 220)
}

/**
 * AudioContext を resume する (ブラウザの autoplay policy で suspended 状態のことがある)
 * 初回 keydown 等のユーザー操作と同時に呼び出す
 */
export const resumeAudio = () => {
  const ctx = getContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()
}
