"use client"

import { useSyncExternalStore } from "react"

import { getMasterVolume, isMuted, setMasterVolume, setMuted, subscribeAudioPrefs } from "@/libs/sound-fx"

/**
 * プレイ画面右上に置くフローティングの音量 UI。値は localStorage に永続化される。
 *
 * `useSyncExternalStore` で sound-fx 内の master volume / mute 状態を購読しているため:
 * - SSR 安全 (server snapshot を別に渡せる)
 * - sound-fx 側が更新通知すれば自動再描画される
 * - useEffect での setState 同期呼びを避けられる (react-hooks/set-state-in-effect 対策)
 */
export function AudioControls() {
  const volume = useSyncExternalStore(subscribeAudioPrefs, getMasterVolume, getServerVolume)
  const muted = useSyncExternalStore(subscribeAudioPrefs, isMuted, getServerMuted)

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value) / 100
    setMasterVolume(v)
    if (v > 0 && muted) setMuted(false)
  }

  const handleToggleMute = () => {
    setMuted(!muted)
  }

  const icon = muted ? "🔇" : volume < 0.3 ? "🔈" : volume < 0.7 ? "🔉" : "🔊"

  return (
    <div className="audio-controls">
      <button
        aria-label={muted ? "音声をオンにする" : "音声をオフにする"}
        className="audio-toggle"
        onClick={handleToggleMute}
        title={muted ? "ミュート解除" : "ミュート"}
        type="button"
      >
        {icon}
      </button>
      <input
        aria-label="音量"
        className="audio-slider"
        disabled={muted}
        max={100}
        min={0}
        onChange={handleVolumeChange}
        type="range"
        value={Math.round(volume * 100)}
      />
    </div>
  )
}

/**
 * SSR 時の volume / muted snapshot。クライアントの最初の hydration 直後に
 * 本物の localStorage 値で再評価されるが、初回 HTML はこの値で生成される
 */
const getServerVolume = () => 0.6
const getServerMuted = () => false
