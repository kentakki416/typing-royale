"use client"

import { useState } from "react"

import type { UpdateBadgeConfigRequest } from "@repo/api-schema"

import { updateBadgeConfigAction } from "./actions"

type DisplayItem = UpdateBadgeConfigRequest["display_items"][number]

const ALL_ITEMS: readonly DisplayItem[] = [
  "grade",
  "best_score",
  "rank",
  "streak_days",
  "typed_chars",
  "username",
] as const

const ITEM_LABELS: Record<DisplayItem, string> = {
  best_score: "ベストスコア",
  grade: "グレード",
  rank: "TS 全期間順位",
  streak_days: "連続日数",
  typed_chars: "累計打鍵数",
  username: "ユーザー名",
}

type Props = {
    initialDisplayItems: DisplayItem[]
    username: string
}

export function BadgeForm({ initialDisplayItems, username }: Props) {
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>(initialDisplayItems)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState(0)

  const toggle = (slug: DisplayItem) => {
    setDirty(true)
    setDisplayItems((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug])
  }

  const onSave = async () => {
    if (displayItems.length === 0 || displayItems.length > 5 || saving) return
    setSaving(true)
    setError(null)
    try {
      await updateBadgeConfigAction({ displayItems })
      setDirty(false)
      setSavedAt(new Date())
      setPreviewKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました")
    } finally {
      setSaving(false)
    }
  }

  const previewUrl = `/api/internal/badge-preview/${encodeURIComponent(username)}?v=${previewKey}`
  const publicBadgeUrl = `/badge/${encodeURIComponent(username)}.svg`
  const embedSnippet = `<img src="${publicBadgeUrl}" alt="${username} の Typing Royale バッジ">`

  return (
    <div className="row">
      <div className="col">
        <div className="card mb-16">
          <div className="card-header">
            <div className="card-title">表示項目 (1〜5 個)</div>
          </div>
          <div style={{ display: "grid", gap: "8px" }}>
            {ALL_ITEMS.map((slug) => (
              <label className="flex gap-8" key={slug} style={{ alignItems: "center", cursor: "pointer" }}>
                <input
                  checked={displayItems.includes(slug)}
                  onChange={() => toggle(slug)}
                  type="checkbox"
                />
                <span>{ITEM_LABELS[slug]}</span>
              </label>
            ))}
          </div>
          <div className="text-sm text-muted mt-8">{displayItems.length}/5 選択中</div>
        </div>

        <div className="flex gap-12" style={{ alignItems: "center" }}>
          <button
            className="btn btn-primary"
            disabled={!dirty || saving || displayItems.length === 0 || displayItems.length > 5}
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

      <aside className="col-sidebar">
        <div className="card mb-16">
          <div className="card-header">
            <div className="card-title">プレビュー</div>
          </div>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`${username} のバッジプレビュー`} src={previewUrl} />
          </div>
          <div className="text-sm text-muted text-center mt-8">
            保存すると即時更新されます
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">README に貼る</div>
          </div>
          <pre
            className="text-sm"
            style={{
              background: "var(--bg-surface-2)",
              borderRadius: "4px",
              overflow: "auto",
              padding: "8px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {embedSnippet}
          </pre>
        </div>
      </aside>
    </div>
  )
}
