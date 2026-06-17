"use client"

import Link from "next/link"
import { useEffect } from "react"

import type { GetHallOfFameResponse } from "@repo/api-schema"

import { CrownSvg } from "@/components/crown-svg"

type Entry = GetHallOfFameResponse["entries"][number]

type Props = {
  entry: Entry
  onClose: () => void
}

type CrownedRank = 1 | 2 | 3
type CrownSlug = "gold" | "silver" | "bronze"
type RankSlug = CrownSlug | "white"

const CROWNED_RANK_SLUG: Record<CrownedRank, CrownSlug> = {
  1: "gold",
  2: "silver",
  3: "bronze",
}

const slugForRank = (rank: number): RankSlug => {
  if (rank === 1) return "gold"
  if (rank === 2) return "silver"
  if (rank === 3) return "bronze"
  return "white"
}

/**
 * Hall of Fame 全 TOP 10 の神モーダル
 *
 * `.curtain-stage.active[data-rank=...]` 構造を 1.8 秒のカーテン演出付きで表示。
 * TOP 1〜3 はクラウン付き + 金 / 銀 / 銅 パレット、4 位以降はクラウン無し + 白色パレット。
 * バックドロップクリックまたは × ボタンで onClose を呼ぶ。 ESC キーでも閉じる
 */
export function CurtainModal({ entry, onClose }: Props) {
  const slug = slugForRank(entry.rank)
  const crowned = entry.rank <= 3
  const rankLabel = `TS オールタイム #${entry.rank}`

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

        {crowned && (
          <span aria-hidden="true" className="god-modal-crown">
            <CrownSvg
              scope={`god-modal-${slug}`}
              slug={CROWNED_RANK_SLUG[entry.rank as CrownedRank]}
              variant="modal"
            />
          </span>
        )}

        <div className="text-center">
          <PlayerAvatar avatarUrl={entry.user.avatar_url} displayName={entry.user.display_name} />
          <h2 style={{ fontSize: "28px", margin: "16px 0 6px" }}>@{entry.user.display_name}</h2>
          <div className="flex gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <span className={`badge ${slug}`}>{rankLabel}</span>
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
