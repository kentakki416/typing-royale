"use client"

import { useEffect } from "react"

import type { GetHallOfFameResponse } from "@repo/api-schema"

import { CrownSvg } from "@/components/crown-svg"
import { UserProfileCard } from "@/components/user-profile-card"
import { formatUsername } from "@/libs/format-username"

type Entry = GetHallOfFameResponse["entries"][number]

type Props = {
  entry: Entry
  languageName: string
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
 * バックドロップクリックまたは × ボタンで onClose を呼ぶ。 ESC キーでも閉じる。
 *
 * 中身（プロフィール表示）はランキングと共通の {@link UserProfileCard}。
 * 演出（カーテン / クラウン）でのみ見せ方を変える。
 */
export function CurtainModal({ entry, languageName, onClose }: Props) {
  const slug = slugForRank(entry.rank)
  const crowned = entry.rank <= 3
  const rankLabel = `${languageName} オールタイム #${entry.rank}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

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
      {/**
       * カーテン演出 + フラッシュは TOP 1-3 (= crowned) のみ。
       * 4 位以下は backdrop fade + modal scale-in だけのシンプルな出現にして
       * 「神々の祭壇」感を 1-3 だけに残す
       */}
      {crowned && (
        <>
          <div className="curtain curtain-left" />
          <div className="curtain curtain-right" />
          <div className="curtain-flash" />
        </>
      )}

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

        <UserProfileCard
          achievedAt={entry.played_at}
          avatarUrl={entry.user.avatar_url}
          accuracy={entry.accuracy}
          bestPlaySessionId={entry.best_play_session_id}
          favoriteRepoUrl={entry.user.favorite_repo_url}
          gradeSlug={entry.user.current_grade}
          rankBadgeClassName={`badge ${slug}`}
          rankLabel={rankLabel}
          score={entry.score}
          typedChars={entry.typed_chars}
          username={formatUsername(entry.user)}
        />
      </div>
    </div>
  )
}
