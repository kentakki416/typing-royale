/**
 * プレイ画面の SE を Web Audio API でフル procedural に生成する
 *
 * mp3 / wav は持たず、OscillatorNode と短い noise buffer だけで構成する
 * (バンドル容量 0 / 著作権リスク 0)。
 *
 * - keystroke は「メカニカルクリック (band-pass noise burst)」+「軽い pitched
 *   アクセント (C メジャー pentatonic からランダム)」を重ねた 2 レイヤー構成。
 *   メカ感で打鍵の実感を、ピッチで音楽的な高揚感を出す。combo に応じてピッチが
 *   オクターブ上に持ち上がり、上昇メロディに聞こえる
 * - master volume / mute は localStorage に永続化する
 * - AudioContext はブラウザの autoplay policy 上「ユーザー操作後」に
 *   resume が必要なので、初回 keydown で `resumeAudio()` を呼ぶ
 */

const STORAGE_VOLUME_KEY = "typing-royale.audio.volume"
const STORAGE_MUTED_KEY = "typing-royale.audio.muted"

let cachedContext: AudioContext | null = null
let masterGain: GainNode | null = null
let masterVolume = 0.6
let muted = false
let prefsLoaded = false

/**
 * volume / muted の変更を購読する listener。
 * `useSyncExternalStore` から呼ばれて UI と sound-fx の状態を同期する
 */
type PrefsListener = () => void
const prefsListeners = new Set<PrefsListener>()
const notifyPrefsChange = () => prefsListeners.forEach((fn) => fn())

export const subscribeAudioPrefs = (fn: PrefsListener): (() => void) => {
  prefsListeners.add(fn)
  return () => {
    prefsListeners.delete(fn)
  }
}

const loadPrefs = () => {
  if (prefsLoaded) return
  if (typeof window === "undefined") return
  prefsLoaded = true
  const v = window.localStorage.getItem(STORAGE_VOLUME_KEY)
  if (v !== null) {
    const n = Number(v)
    if (!Number.isNaN(n)) masterVolume = Math.max(0, Math.min(1, n))
  }
  if (window.localStorage.getItem(STORAGE_MUTED_KEY) === "1") muted = true
}

const getContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null
  loadPrefs()
  if (cachedContext !== null) return cachedContext
  const Ctx = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  cachedContext = new Ctx()
  masterGain = cachedContext.createGain()
  masterGain.gain.setValueAtTime(muted ? 0 : masterVolume, cachedContext.currentTime)
  masterGain.connect(cachedContext.destination)
  return cachedContext
}

const getMaster = (): GainNode | null => {
  getContext()
  return masterGain
}

export const getMasterVolume = (): number => {
  loadPrefs()
  return masterVolume
}

export const isMuted = (): boolean => {
  loadPrefs()
  return muted
}

export const setMasterVolume = (v: number) => {
  loadPrefs()
  masterVolume = Math.max(0, Math.min(1, v))
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_VOLUME_KEY, String(masterVolume))
  }
  const master = getMaster()
  const ctx = getContext()
  if (master && ctx) {
    master.gain.setTargetAtTime(muted ? 0 : masterVolume, ctx.currentTime, 0.02)
  }
  notifyPrefsChange()
}

export const setMuted = (m: boolean) => {
  loadPrefs()
  muted = m
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_MUTED_KEY, m ? "1" : "0")
  }
  const master = getMaster()
  const ctx = getContext()
  if (master && ctx) {
    master.gain.setTargetAtTime(m ? 0 : masterVolume, ctx.currentTime, 0.02)
  }
  notifyPrefsChange()
}

/**
 * AudioContext を resume する (ブラウザ autoplay policy で suspended のことがある)。
 * 初回 keydown 等のユーザー操作と同時に呼び出す
 */
export const resumeAudio = () => {
  const ctx = getContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()
}

/* -------------------------------------------------------------------------- */
/* SE                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * C メジャー pentatonic 1 オクターブ (C5, D5, E5, G5, A5)。
 * 打鍵アクセントとして軽く重ねる音。combo の伸びでさらにオクターブ上に transpose
 */
const PENTATONIC_HZ = [523.25, 587.33, 659.25, 783.99, 880.0]

/**
 * 短い white noise バッファを 1 回生成してキャッシュする。
 * メカニカルクリックの素材として使い回す (毎回 new するより軽い)
 */
let noiseBufferCache: AudioBuffer | null = null
const getNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  if (noiseBufferCache !== null) return noiseBufferCache
  const length = Math.floor(0.025 * ctx.sampleRate)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  noiseBufferCache = buffer
  return buffer
}

/**
 * 正解打鍵時の音。
 *
 * - レイヤー1: 12ms の band-pass noise burst (~2.5kHz) = メカニカルキーボードの
 *   「コッ / カチッ」感
 * - レイヤー2: pentatonic からランダム選択した triangle トーン = ピッチアクセント。
 *   combo の伸びでオクターブが上がり、連打が上昇メロディに聞こえる
 *
 * 全体で 60ms 以下にして、高速連打しても残響が被らないようキレを優先する
 */
export const playKeyHit = (combo = 0) => {
  const ctx = getContext()
  const master = getMaster()
  if (!ctx || !master) return
  const now = ctx.currentTime

  /** ----- レイヤー 1: メカニカルクリック ----- */
  const click = ctx.createBufferSource()
  click.buffer = getNoiseBuffer(ctx)
  const clickFilter = ctx.createBiquadFilter()
  clickFilter.type = "bandpass"
  /**
   * combo が伸びると中心周波数を少し上げて、より「カチッ」とした明るい音にする
   */
  clickFilter.frequency.value = combo >= 15 ? 3200 : combo >= 5 ? 2800 : 2400
  clickFilter.Q.value = 1.4
  const clickGain = ctx.createGain()
  clickGain.gain.setValueAtTime(0, now)
  clickGain.gain.linearRampToValueAtTime(0.14, now + 0.002)
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)
  click.connect(clickFilter).connect(clickGain).connect(master)
  click.start(now)
  click.stop(now + 0.04)

  /** ----- レイヤー 2: ピッチアクセント ----- */
  const octaveBoost = combo >= 30 ? 2 : combo >= 15 ? 1 : 0
  const idx = Math.floor(Math.random() * PENTATONIC_HZ.length)
  const freq = PENTATONIC_HZ[idx] * Math.pow(2, octaveBoost)
  const osc = ctx.createOscillator()
  const oscGain = ctx.createGain()
  osc.type = "triangle"
  osc.frequency.setValueAtTime(freq, now)
  /**
   * ピッチは控えめ。click を主役にしつつ、上昇メロディが薄っすら聞こえる程度
   */
  oscGain.gain.setValueAtTime(0, now)
  oscGain.gain.linearRampToValueAtTime(0.04, now + 0.003)
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055)
  osc.connect(oscGain).connect(master)
  osc.start(now)
  osc.stop(now + 0.065)
}

/**
 * 誤打鍵時の dull thud (sawtooth を low-pass してダウンスイープ)
 */
export const playKeyMiss = () => {
  const ctx = getContext()
  const master = getMaster()
  if (!ctx || !master) return
  const now = ctx.currentTime
  const duration = 0.12
  const osc = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  osc.type = "sawtooth"
  osc.frequency.setValueAtTime(180, now)
  osc.frequency.exponentialRampToValueAtTime(80, now + duration)
  filter.type = "lowpass"
  filter.frequency.setValueAtTime(420, now)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.08, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(filter).connect(gain).connect(master)
  osc.start(now)
  osc.stop(now + duration + 0.01)
}

/**
 * tier アップ時の上昇 sweep + CMaj triad drop。「ドロップ感」で達成感を出す
 */
export const playTierUp = () => {
  const ctx = getContext()
  const master = getMaster()
  if (!ctx || !master) return
  const now = ctx.currentTime
  /** sweep: 220Hz → 880Hz の 0.2 秒ライザー */
  const sweepOsc = ctx.createOscillator()
  const sweepGain = ctx.createGain()
  sweepOsc.type = "sawtooth"
  sweepOsc.frequency.setValueAtTime(220, now)
  sweepOsc.frequency.exponentialRampToValueAtTime(880, now + 0.2)
  sweepGain.gain.setValueAtTime(0, now)
  sweepGain.gain.linearRampToValueAtTime(0.08, now + 0.05)
  sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
  sweepOsc.connect(sweepGain).connect(master)
  sweepOsc.start(now)
  sweepOsc.stop(now + 0.3)
  /** chord: CMaj triad (C5, E5, G5) を sweep の終端で重ねる */
  const chordStart = now + 0.2
  const chord = [523.25, 659.25, 783.99]
  chord.forEach((f, i) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = "triangle"
    o.frequency.setValueAtTime(f, chordStart)
    g.gain.setValueAtTime(0, chordStart)
    g.gain.linearRampToValueAtTime(0.05 - i * 0.005, chordStart + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, chordStart + 0.55)
    o.connect(g).connect(master)
    o.start(chordStart)
    o.stop(chordStart + 0.6)
  })
}

/**
 * 残り 30s / 10s 時の警告 chirp (高めから低めへ短いダウンスイープ)
 */
export const playUrgentTick = () => {
  const ctx = getContext()
  const master = getMaster()
  if (!ctx || !master) return
  const now = ctx.currentTime
  const duration = 0.1
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "square"
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(440, now + duration)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.08, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(gain).connect(master)
  osc.start(now)
  osc.stop(now + duration + 0.01)
}

/**
 * /finish 直後のファンファーレ (arpeggio + coda chord)
 */
export const playFinish = () => {
  const ctx = getContext()
  const master = getMaster()
  if (!ctx || !master) return
  const now = ctx.currentTime
  const arp = [261.63, 329.63, 392.0, 523.25]
  arp.forEach((f, i) => {
    const t = now + i * 0.09
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = "triangle"
    o.frequency.setValueAtTime(f, t)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.09, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + 0.3)
  })
  const codaStart = now + arp.length * 0.09 + 0.05
  const coda = [261.63, 329.63, 392.0, 523.25, 659.25]
  coda.forEach((f, i) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = "triangle"
    o.frequency.setValueAtTime(f, codaStart)
    g.gain.setValueAtTime(0, codaStart)
    g.gain.linearRampToValueAtTime(0.06 - i * 0.005, codaStart + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, codaStart + 1.2)
    o.connect(g).connect(master)
    o.start(codaStart)
    o.stop(codaStart + 1.3)
  })
}
