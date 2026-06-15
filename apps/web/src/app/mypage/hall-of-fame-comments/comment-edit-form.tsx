"use client"

import { useState } from "react"

import { updateHallOfFameCommentAction } from "./actions"

type EntrySlot = {
    entryId: number
    comment: string
} | null

type Props = {
    jsEntry: EntrySlot
    tsEntry: EntrySlot
}

const LANGUAGE_LABELS = {
  javascript: "JavaScript",
  typescript: "TypeScript",
} as const

type Lang = keyof typeof LANGUAGE_LABELS

export function CommentEditForm({ jsEntry, tsEntry }: Props) {
  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <LanguageCommentCard entry={tsEntry} language="typescript" />
      <LanguageCommentCard entry={jsEntry} language="javascript" />
    </div>
  )
}

const LanguageCommentCard = ({ entry, language }: { entry: EntrySlot; language: Lang }) => {
  const label = LANGUAGE_LABELS[language]
  const [comment, setComment] = useState(entry?.comment ?? "")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (entry === null) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title">{label}</div>
        </div>
        <p className="text-sm text-muted">
          まだ {label} で殿堂入りコメントを送信していません。リザルト画面の TOP 10 入り通知から送信できます。
        </p>
      </div>
    )
  }

  const onChange = (value: string) => {
    setComment(value)
    setDirty(value !== entry.comment)
  }

  const onSave = async () => {
    if (!dirty || saving || comment.trim().length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await updateHallOfFameCommentAction({
        comment: comment.trim(),
        entryId: entry.entryId,
      })
      setSavedAt(new Date())
      setDirty(false)
      setComment(res.comment)
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{label}</div>
        <span className="text-sm text-muted">{comment.length}/300</span>
      </div>
      <textarea
        disabled={saving}
        maxLength={300}
        onChange={(e) => onChange(e.target.value)}
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
      <div className="flex gap-12 mt-8" style={{ alignItems: "center" }}>
        <button
          className="btn btn-primary"
          disabled={!dirty || saving || comment.trim().length === 0}
          onClick={onSave}
          type="button"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        {savedAt !== null && !dirty && (
          <span className="text-sm text-muted">{savedAt.toLocaleTimeString()} に保存しました</span>
        )}
        {error !== null && (
          <span className="text-sm" style={{ color: "var(--error)" }}>{error}</span>
        )}
      </div>
    </div>
  )
}
