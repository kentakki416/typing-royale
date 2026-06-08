"use client"

import { useEffect, useRef, useState } from "react"

import { submitHallOfFameCommentAction } from "@/app/play/[sessionId]/actions"

type Props = {
    language: "javascript" | "typescript"
    onClose: () => void
    open: boolean
}

/**
 * リザルト画面の TOP 10 入りコメント入力モーダル
 *
 * `<dialog>` 要素ベース。送信成功で 1.5 秒後に自動クローズ。
 * 「あとで書く」で何も書かずに閉じる動線あり (マイページから後で編集可)
 */
export function TopTenCommentModal({ language, onClose, open }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (el === null) return
    if (open && !el.open) {
      el.showModal()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  const onSubmit = async () => {
    const trimmed = comment.trim()
    if (trimmed.length === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await submitHallOfFameCommentAction({ comment: trimmed, language })
      setSubmitted(true)
      setTimeout(() => onClose(), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      onClose={onClose}
      ref={dialogRef}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--gold, #d29922)",
        borderRadius: "8px",
        color: "var(--text-primary)",
        padding: "24px",
        width: "min(560px, 90vw)",
      }}
    >
      <h2 style={{ color: "var(--gold-light, #ffd54a)" }}>🏆 TOP 10 入り見込み！</h2>
      <p className="text-sm text-muted mb-16">
        Hall of Fame に掲載されます。記念にコメントを残しませんか？（任意、300 字以内）
      </p>
      <textarea
        disabled={submitting || submitted}
        maxLength={300}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        style={{
          background: "var(--bg-surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          color: "var(--text-primary)",
          padding: "8px",
          width: "100%",
        }}
        value={comment}
      />
      <div className="text-sm text-muted text-right">{comment.length}/300</div>
      {error !== null && (
        <div className="text-sm" style={{ color: "var(--error)" }}>{error}</div>
      )}
      {submitted && (
        <div className="text-sm" style={{ color: "var(--success)" }}>✓ コメントを公開しました</div>
      )}
      <div className="flex gap-12 mt-16" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose} type="button">あとで書く</button>
        <button
          className="btn btn-primary"
          disabled={comment.trim().length === 0 || submitting || submitted}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "送信中..." : "送信"}
        </button>
      </div>
    </dialog>
  )
}
