"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { GetPlayerResponse } from "@repo/api-schema"

import { UserProfileCard } from "@/components/user-profile-card"
import { formatUsername } from "@/libs/format-username"

type Props = {
  languageName: string
  languageSlug: string
  onClose: () => void
  rank: number
  userId: number
}

type Status = "error" | "loading" | "ready"

/**
 * ランキングで他ユーザーを選択したときのプレーンなプロフィールモーダル。
 *
 * 中身は殿堂入りと同じ {@link UserProfileCard}。月間スナップショットには
 * 最高打点数 / セッション ID が無いため、選択時は GET /api/players/:id
 * （オールタイムベスト）を bridge 経由で取得して統一表示する。
 * 見せ方は data-rank="white" のシンプルなモーダル（カーテン演出なし）。
 */
export function RankingPlayerModal({ languageName, languageSlug, onClose, rank, userId }: Props) {
  const [data, setData] = useState<GetPlayerResponse | null>(null)
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    let active = true
    fetch(`/api/internal/players/${userId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch player")
        return res.json() as Promise<GetPlayerResponse>
      })
      .then((json) => {
        if (!active) return
        setData(json)
        setStatus("ready")
      })
      .catch(() => {
        if (active) setStatus("error")
      })
    return () => {
      active = false
    }
  }, [userId])

  const best = data?.language_bests.find((b) => b.language.slug === languageSlug) ?? null
  const rankLabel = `${languageName} 今月 #${rank}`

  return (
    <div
      className="curtain-stage active"
      data-rank="white"
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("curtain-backdrop")) {
          onClose()
        }
      }}
    >
      <div className="curtain-backdrop" />
      <div className="god-modal" onClick={(e) => e.stopPropagation()}>
        <button aria-label="閉じる" className="modal-close" onClick={onClose} type="button">×</button>

        {status === "loading" && (
          <div className="text-center text-muted" style={{ padding: "48px 0" }}>読み込み中…</div>
        )}

        {status === "error" && (
          <div className="text-center" style={{ padding: "32px 0" }}>
            <p className="text-muted mb-16">プロフィールの取得に失敗しました。</p>
            <Link className="btn" href={`/players/${userId}`}>プレイヤー詳細を見る</Link>
          </div>
        )}

        {status === "ready" && data !== null && (
          <UserProfileCard
            avatarUrl={data.user.avatar_url}
            accuracy={best?.accuracy ?? 0}
            bestPlaySessionId={best?.best_play_session_id ?? null}
            favoriteRepoUrl={data.user.favorite_repo_url}
            gradeSlug={data.lifetime_stats.current_grade.slug}
            rankLabel={rankLabel}
            score={best?.score ?? 0}
            typedChars={best?.typed_chars ?? 0}
            userId={data.user.id}
            username={formatUsername(data.user)}
          />
        )}
      </div>
    </div>
  )
}
