"use client"

import { useState } from "react"

import type { GetHallOfFameResponse } from "@repo/api-schema"

import { CrownSvg } from "@/components/crown-svg"
import { formatPlayedAtDate } from "@/libs/format-date"
import { formatUsername } from "@/libs/format-username"

import { CurtainModal } from "./curtain-modal"

type Entry = GetHallOfFameResponse["entries"][number]

type Props = {
  entries: Entry[]
  languageName: string
}

type CrownedRank = 1 | 2 | 3
type CrownSlug = "gold" | "silver" | "bronze"
type RankSlug = CrownSlug | "white"

const CROWN_META: Record<CrownedRank, { color: string; slug: CrownSlug }> = {
  1: { color: "#ffd54a", slug: "gold" },
  2: { color: "#c0c8d3", slug: "silver" },
  3: { color: "#d2956b", slug: "bronze" },
}

const slugForRank = (rank: number): RankSlug => {
  if (rank === 1) return "gold"
  if (rank === 2) return "silver"
  if (rank === 3) return "bronze"
  return "white"
}

/**
 * Hall of Fame TOP 10 のクラウン付きカード一覧
 *
 * - TOP 1〜3 はクラウン + メタル色 (金/銀/銅) の回転光リング
 * - 4〜10 はクラウン無し + 白色の回転光リングで統一感を出す
 * - 全カードはクリックで CurtainModal を開く (タップ可)
 */
export function HofCards({ entries, languageName }: Props) {
  const [open, setOpen] = useState<Entry | null>(null)

  return (
    <>
      <div className="hof-cards-stack">
        {entries.map((e) => {
          const slug = slugForRank(e.rank)
          const crowned = e.rank <= 3
          const username = formatUsername(e.user)
          return (
            <div
              className="hof-card has-crown tappable"
              data-rank={slug}
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
              {crowned && <CrownWrapper slug={CROWN_META[e.rank as CrownedRank].slug} />}
              <span className="tap-hint">👆 タップ</span>
              <div className={`hof-rank ${slug}`}>#{e.rank}</div>
              <div className="hof-info">
                <div className="flex-center gap-12 mb-8">
                  <PlayerAvatar avatarUrl={e.user.avatar_url} githubUsername={username} large />
                  <div>
                    <h3 style={{ margin: 0 }}>@{username}</h3>
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
                    <div className="text-xs text-muted" style={{ marginTop: "4px" }}>
                      達成: {formatPlayedAtDate(e.played_at)}
                    </div>
                    {e.user.favorite_repo_url !== null && (
                      <GithubLink url={e.user.favorite_repo_url} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {open !== null && (
        <CurtainModal entry={open} languageName={languageName} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

/**
 * カード内に表示する GitHub リンク。
 * `https://github.com/owner/repo` 形式なら短縮表示し、それ以外はホスト + パスを軽く整形
 */
const GithubLink = ({ url }: { url: string }) => {
  const label = formatGithubLabel(url)
  return (
    <a
      className="text-mono text-xs hof-github-link"
      href={url}
      onClick={(e) => e.stopPropagation()}
      rel="noreferrer noopener"
      target="_blank"
      style={{ alignItems: "center", display: "inline-flex", gap: "4px", marginTop: "6px" }}
    >
      <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.898-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
      {label}
    </a>
  )
}

const formatGithubLabel = (url: string): string => {
  try {
    const u = new URL(url)
    if (u.hostname === "github.com") {
      const parts = u.pathname.split("/").filter((s) => s.length > 0)
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
      if (parts.length === 1) return parts[0]
    }
    return url
  } catch {
    return url
  }
}

const PlayerAvatar = ({ avatarUrl, githubUsername, large }: { avatarUrl: string | null; githubUsername: string; large?: boolean }) => {
  const initials = githubUsername.slice(0, 2).toUpperCase()
  if (avatarUrl === null) {
    return <span className={`avatar ${large ? "lg" : "sm"}`}>{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={githubUsername} className={`avatar ${large ? "lg" : "sm"}`} src={avatarUrl} />
  )
}

/**
 * 既存 .hof-crown 位置スタイル (left -10px / top -18px / rotate -14deg) を維持しつつ
 * 立体表現の CrownSvg を埋め込む
 */
const CrownWrapper = ({ slug }: { slug: CrownSlug }) => (
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
