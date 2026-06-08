"use client"

import Link from "next/link"
import { useEffect } from "react"

import type { GetHallOfFameResponse } from "@repo/api-schema"

type Entry = GetHallOfFameResponse["entries"][number]

type Props = {
  entry: Entry
  onClose: () => void
}

type Rank = 1 | 2 | 3

const RANK_SLUG: Record<Rank, "gold" | "silver" | "bronze"> = {
  1: "gold",
  2: "silver",
  3: "bronze",
}

const RANK_LABEL: Record<Rank, string> = {
  1: "TS オールタイム #1",
  2: "TS オールタイム #2",
  3: "TS オールタイム #3",
}

/**
 * Hall of Fame 上位 3 名の神モーダル
 *
 * `.curtain-stage.active[data-rank=...]` 構造を 1.8 秒のカーテン演出付きで表示。
 * バックドロップクリックまたは × ボタンで onClose を呼ぶ。
 * ESC キーでも閉じる
 */
export function CurtainModal({ entry, onClose }: Props) {
  const rank = entry.rank as Rank
  const slug = RANK_SLUG[rank] ?? "gold"

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const repoLabel = formatRepoUrl(entry.user.favorite_repo_url)

  return (
    <div
      className="curtain-stage active"
      data-rank={slug}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("curtain-backdrop")) {
          onClose()
        }
      }}
    >
      <div className="curtain-backdrop" />
      <div className="curtain curtain-left" />
      <div className="curtain curtain-right" />
      <div className="curtain-flash" />

      <div className="god-modal" onClick={(e) => e.stopPropagation()}>
        <button aria-label="閉じる" className="modal-close" onClick={onClose} type="button">×</button>

        <CrownSvg slug={slug} />

        <div className="text-center">
          <PlayerAvatar avatarUrl={entry.user.avatar_url} displayName={entry.user.display_name} />
          <h2 style={{ fontSize: "28px", margin: "16px 0 6px" }}>@{entry.user.display_name}</h2>
          <div className="flex gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <span className={`badge ${slug}`}>{RANK_LABEL[rank] ?? `#${rank}`}</span>
            <span
              className={`badge-grade ${entry.user.current_grade}`}
              data-level={GRADE_LEVELS[entry.user.current_grade] ?? 1}
            >
              {capitalizeGradeSlug(entry.user.current_grade)}
            </span>
          </div>
        </div>

        <div className="stat-row mt-24">
          <div className="stat">
            <div className="stat-value accent">{entry.score.toLocaleString()}</div>
            <div className="stat-label">ベストスコア</div>
          </div>
          <div className="stat">
            <div className="stat-value">{entry.typed_chars.toLocaleString()}</div>
            <div className="stat-label">最高文字数</div>
          </div>
          <div className="stat">
            <div className="stat-value success">{(entry.accuracy * 100).toFixed(1)}%</div>
            <div className="stat-label">最高正確率</div>
          </div>
        </div>

        {entry.comment !== null && (
          <div className="card mt-24" style={{ padding: "16px 18px" }}>
            <div className="card-title text-sm mb-8" style={{ color: "var(--gold-light)" }}>💬 殿堂入りコメント</div>
            <div className="hof-comment" style={{ fontSize: "14px", lineHeight: 1.7, marginTop: 0 }}>
              &ldquo;{entry.comment}&rdquo;
            </div>
          </div>
        )}

        {entry.user.favorite_repo_url !== null && repoLabel !== null && (
          <div className="card mt-16" style={{ padding: "16px 18px" }}>
            <div className="card-title text-sm mb-8" style={{ color: "var(--accent)" }}>📦 お気に入りリポジトリ</div>
            <a
              className="text-mono text-sm"
              href={entry.user.favorite_repo_url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {repoLabel}
            </a>
          </div>
        )}

        <div className="flex gap-12 mt-24" style={{ flexWrap: "wrap", justifyContent: "center" }}>
          <Link className="btn btn-primary" href={`/replay/${entry.best_play_session_id}`}>
            ▶ リプレイを見る
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * github.com の URL は `owner/repo` 形式で短縮表示し、それ以外は URL をそのまま見せる
 */
const formatRepoUrl = (url: string | null): string | null => {
  if (url === null) return null
  try {
    const u = new URL(url)
    if (u.hostname === "github.com") {
      const parts = u.pathname.split("/").filter((s) => s.length > 0)
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
    }
    return url
  } catch {
    return url
  }
}

const PlayerAvatar = ({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) => {
  const initials = displayName.slice(0, 2).toUpperCase()
  const style = { fontSize: "30px", height: "96px", margin: "0 auto", width: "96px" }
  if (avatarUrl === null) {
    return <span className="avatar lg" style={style}>{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={displayName} className="avatar lg" src={avatarUrl} style={style} />
  )
}

/**
 * モーダル上部に大きく出すクラウン SVG（mock の god-modal-crown）
 */
const CrownSvg = ({ slug }: { slug: "gold" | "silver" | "bronze" }) => {
  const gradient = GRADIENTS[slug]
  const gradId = `crown-${slug}-modal`
  return (
    <span className="god-modal-crown" aria-hidden="true">
      <svg viewBox="0 0 56 40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradient.top} />
            <stop offset="55%" stopColor={gradient.mid} />
            <stop offset="100%" stopColor={gradient.bottom} />
          </linearGradient>
        </defs>
        <path
          d="M2 14 L10 30 L18 16 L28 4 L38 16 L46 30 L54 14 L52 36 L4 36 Z"
          fill={`url(#${gradId})`}
          stroke={gradient.stroke}
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <rect fill={`url(#${gradId})`} height="6" rx="1.5" stroke={gradient.stroke} strokeWidth="1.5" width="48" x="4" y="33" />
        <circle cx="2" cy="14" fill={`url(#${gradId})`} r="3" stroke={gradient.stroke} strokeWidth="1.2" />
        <circle cx="28" cy="4" fill={`url(#${gradId})`} r="3.5" stroke={gradient.stroke} strokeWidth="1.2" />
        <circle cx="54" cy="14" fill={`url(#${gradId})`} r="3" stroke={gradient.stroke} strokeWidth="1.2" />
      </svg>
    </span>
  )
}

const GRADIENTS: Record<"gold" | "silver" | "bronze", { top: string; mid: string; bottom: string; stroke: string }> = {
  bronze: { bottom: "#74462a", mid: "#d2956b", stroke: "#3d2a18", top: "#f5d6b8" },
  gold: { bottom: "#b8860b", mid: "#ffd54a", stroke: "#5a4408", top: "#fff8d0" },
  silver: { bottom: "#8a939e", mid: "#d8dee9", stroke: "#4a5260", top: "#ffffff" },
}

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
