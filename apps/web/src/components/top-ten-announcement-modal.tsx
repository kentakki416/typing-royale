"use client"

import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { useEffect, useRef } from "react"

export type TopTenAnnouncementKind = "all-time" | "monthly"

type Props = {
  kind: TopTenAnnouncementKind
  onClose: () => void
  open: boolean
}

type Content = {
  /** タイトル + ボタン + アクセント枠で使うメインカラー (単色で text-shadow グロー) */
  accent: string
  /** タイトル文字の glow (祝福感を出す) */
  textGlow: string
  message: string
  title: string
}

const CONTENT: Record<TopTenAnnouncementKind, Content> = {
  "all-time": {
    accent: "#ffd54a",
    message: "他のユーザーがあなたに挑戦することが可能になります。",
    textGlow: "0 0 12px rgba(255, 213, 74, 0.85), 0 0 28px rgba(255, 200, 61, 0.55)",
    title: "🏆 殿堂入りにランクインしました",
  },
  "monthly": {
    accent: "#7dd3fc",
    message: "他のユーザーがあなたのタイピングを視聴することが可能になります。",
    textGlow: "0 0 12px rgba(125, 211, 252, 0.85), 0 0 28px rgba(88, 166, 255, 0.55)",
    title: "🏆 月間 TOP 10 にランクインしました",
  },
}

/**
 * リザルト画面の TOP 10 入賞お知らせモーダル
 *
 * 殿堂入り / 月間で文言が異なるが UI 構造は同じため `kind` で出し分け。
 * 入賞判定はサーバー側 (`/finish`) で行い、フロントは表示の有無のみを切り替える
 * (詳細: docs/spec/result-top-ten-popup/README.md)
 *
 * 演出: 紙吹雪 Lottie を背面にループ再生 + タイトルにグラデーション/ドロップシャドウ +
 * dialog 全体に scale-in アニメ
 */
export function TopTenAnnouncementModal({ kind, onClose, open }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const content = CONTENT[kind]

  useEffect(() => {
    const el = dialogRef.current
    if (el === null) return
    if (open && !el.open) {
      el.showModal()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  return (
    <dialog
      className="top-ten-announcement-dialog"
      onClose={onClose}
      ref={dialogRef}
      style={{
        /**
         * 紙吹雪 Lottie が背面で動くため、 dialog 自体は不透明寄りにして
         * テキスト視認性を確保する (透けると文字が読めなくなる)
         */
        background: "rgba(15, 18, 28, 0.96)",
        border: `1px solid ${content.accent}`,
        borderRadius: "12px",
        boxShadow: `0 0 36px -10px ${content.accent}, 0 24px 80px -32px rgba(0,0,0,0.7)`,
        color: "var(--text-primary)",
        margin: "auto",
        overflow: "hidden",
        padding: 0,
        position: "fixed",
        width: "min(520px, 92vw)",
      }}
    >
      {/**
       * 紙吹雪 Lottie を背面に。pointer-events: none で OK ボタン操作を阻害しない
       */}
      <div
        aria-hidden="true"
        style={{
          inset: 0,
          /**
           * 紙吹雪はタイトルが埋もれないように 0.4 程度に抑える。
           * dialog 自体が暗色で前面に来るので、紙吹雪は dialog の上下端や周囲で
           * 動きが感じられる程度で十分。 dialog の shadow + glow が祝福感を補強する
           */
          opacity: 0.4,
          pointerEvents: "none",
          position: "absolute",
        }}
      >
        <DotLottieReact
          autoplay
          loop
          src="/celebration.lottie"
          style={{ height: "100%", width: "100%" }}
        />
      </div>

      <div style={{ padding: "32px 28px", position: "relative", zIndex: 1 }}>
        <h2
          style={{
            color: content.accent,
            fontSize: "26px",
            fontWeight: 800,
            margin: "0 0 14px",
            textAlign: "center",
            textShadow: content.textGlow,
          }}
        >
          {content.title}
        </h2>
        <p
          className="text-sm mb-16"
          style={{ color: "var(--text-secondary)", textAlign: "center" }}
        >
          {content.message}
        </p>
        {/**
         * 達成カードは /finish の enqueue 後に apps/worker が非同期生成するため、
         * 「準備中なのでホームで待ってほしい」「後からマイページでも取得できる」ことを案内する
         * (rewards-worker step4 の pending/missed popup と整合)
         */}
        <p
          className="text-sm"
          style={{ color: content.accent, fontWeight: 700, marginBottom: "6px", textAlign: "center" }}
        >
          🎁 特典を準備中です。ホーム画面に戻ってお待ちください。
        </p>
        <p
          className="text-xs mb-24"
          style={{ color: "var(--text-muted)", textAlign: "center" }}
        >
          特典はマイページからいつでも取得できます。
        </p>
        <div className="flex" style={{ justifyContent: "center" }}>
          <button
            className="btn btn-primary btn-large"
            onClick={onClose}
            style={{ minWidth: "140px" }}
            type="button"
          >
            OK
          </button>
        </div>
      </div>
    </dialog>
  )
}
