"use client"

import { useEffect, useRef } from "react"

export type TopTenAnnouncementKind = "all-time" | "monthly"

type Props = {
  kind: TopTenAnnouncementKind
  onClose: () => void
  open: boolean
}

const CONTENT: Record<TopTenAnnouncementKind, { accent: string; message: string; title: string }> = {
  "all-time": {
    accent: "var(--gold-light, #ffd54a)",
    message: "他のユーザーがあなたに挑戦することが可能になります。",
    title: "🏆 殿堂入りにランクインしました",
  },
  "monthly": {
    accent: "var(--accent, #58a6ff)",
    message: "他のユーザーがあなたのタイピングを視聴することが可能になります。",
    title: "🏆 月間 TOP 10 にランクインしました",
  },
}

/**
 * リザルト画面の TOP 10 入賞お知らせモーダル
 *
 * 殿堂入り / 月間で文言が異なるが UI 構造は同じため `kind` で出し分け。
 * 入賞判定はサーバー側 (`/finish`) で行い、フロントは表示の有無のみを切り替える
 * (詳細: docs/spec/result-top-ten-popup/README.md)
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
      onClose={onClose}
      ref={dialogRef}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${content.accent}`,
        borderRadius: "8px",
        color: "var(--text-primary)",
        /**
         * showModal() の中央配置は UA デフォルトの margin: auto に依存しているため、
         * style 上書きで margin が消えないよう明示する (一部ブラウザ / グローバル CSS
         * リセット環境で左上に張り付くのを防止)
         */
        margin: "auto",
        padding: "24px",
        width: "min(480px, 90vw)",
      }}
    >
      <h2 style={{ color: content.accent, fontSize: "22px", margin: "0 0 12px" }}>
        {content.title}
      </h2>
      <p className="text-sm mb-16" style={{ color: "var(--text-secondary)" }}>
        {content.message}
      </p>
      <div className="flex" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onClose} type="button">
          OK
        </button>
      </div>
    </dialog>
  )
}
