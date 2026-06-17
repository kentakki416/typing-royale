"use client"

import { useState } from "react"

import type { GetHallOfFameResponse } from "@repo/api-schema"

import { CrownSvg } from "@/components/crown-svg"

import { CurtainModal } from "./curtain-modal"

type Entry = GetHallOfFameResponse["entries"][number]

type Props = {
  entries: Entry[]
}

type Rank = 1 | 2 | 3

const RANK_META: Record<Rank, { color: string; label: string; slug: "gold" | "silver" | "bronze" }> = {
  1: { color: "#ffd54a", label: "#1", slug: "gold" },
  2: { color: "#c0c8d3", label: "#2", slug: "silver" },
  3: { color: "#d2956b", label: "#3", slug: "bronze" },
}

/**
 * Hall of Fame 上位 3 名のクラウン付きカード
 *
 * クリックで CurtainModal（カーテン演出 + 神モーダル）を開く。
 * 1 件だけマウントする state を持ち、open === null でモーダル非表示
 */
export function HofCards({ entries }: Props) {
  const [open, setOpen] = useState<Entry | null>(null)

  return (
    <>
      <div
        style={{
          background: "#05080d",
          borderRadius: "20px",
          display: "grid",
          gap: "20px",
          padding: "32px 24px",
        }}
      >
        {entries.map((e) => {
          const rank = e.rank as Rank
          const meta = RANK_META[rank]
          if (!meta) return null
          return (
            <div
              className="hof-card has-crown tappable"
              data-rank={meta.slug}
              key={e.best_play_session_id}
              onClick={() => setOpen(e)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault()
                  setOpen(e)
                }
              }}
              role="button"
              tabIndex={0}
            >
              <CrownWrapper slug={meta.slug} />
              <span className="tap-hint">👆 タップ</span>
              <div className={`hof-rank ${meta.slug}`}>{meta.label}</div>
              <div className="hof-info">
                <div className="flex-center gap-12 mb-8">
                  <PlayerAvatar avatarUrl={e.user.avatar_url} displayName={e.user.display_name} large />
                  <div>
                    <h3 style={{ margin: 0 }}>@{e.user.display_name}</h3>
                    <div className="text-sm text-muted">
                      {e.score.toLocaleString()} pts · {e.typed_chars.toLocaleString()} 文字 · {(e.accuracy * 100).toFixed(1)}%
                      {" · "}
                      <span
                        className={`badge-grade ${e.user.current_grade}`}
                        data-level={GRADE_LEVELS[e.user.current_grade] ?? 1}
                      >
                        {capitalizeGradeSlug(e.user.current_grade)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {open !== null && (
        <CurtainModal entry={open} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

const PlayerAvatar = ({ avatarUrl, displayName, large }: { avatarUrl: string | null; displayName: string; large?: boolean }) => {
  const initials = displayName.slice(0, 2).toUpperCase()
  if (avatarUrl === null) {
    return <span className={`avatar ${large ? "lg" : "sm"}`}>{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={displayName} className={`avatar ${large ? "lg" : "sm"}`} src={avatarUrl} />
  )
}

/**
 * 既存 .hof-crown 位置スタイル (left -10px / top -18px / rotate -14deg) を維持しつつ
 * 立体表現の CrownSvg を埋め込む
 */
const CrownWrapper = ({ slug }: { slug: "gold" | "silver" | "bronze" }) => (
  <span aria-hidden="true" className={`hof-crown ${slug}`}>
    <CrownSvg scope={`hof-card-${slug}`} slug={slug} variant="card" />
  </span>
)

const GRADE_LEVELS: Record<string, number> = {
  distinguished: 7,
  fellow: 8,
  intern: 1,
  junior: 2,
  mid: 3,
  principal: 6,
  senior: 4,
  staff: 5,
}

const capitalizeGradeSlug = (slug: string): string => slug.charAt(0).toUpperCase() + slug.slice(1)
