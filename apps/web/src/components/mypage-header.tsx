import Link from "next/link"

import { GetMyRankingResponse, GetUserResponse } from "@repo/api-schema"

import { gradeBadgeClass } from "@/libs/grade"

type Props = {
  /**
   * 現在表示中のタブ。タブの active 状態に使う
   */
  active: "account" | "rewards" | "summary"
  /**
   * 全言語通算グレード（未プレイ時は null で Intern 表示）
   */
  grade: GetMyRankingResponse["grade"] | null
  me: GetUserResponse
}

/**
 * マイページ共通ヘッダー（サマリー / 特典 / 設定で共有）。
 *
 * アバター + GitHub username + ランキング掲載 ON/OFF + 全言語通算グレード badge と、
 * 3 タブ（サマリー / 特典 / 設定）のナビゲーションをまとめて描画する。
 */
export function MyPageHeader({ active, grade, me }: Props) {
  const initials = (me.github_username ?? "??").slice(0, 2).toUpperCase()

  return (
    <>
      <div className="flex gap-16 mb-24" style={{ alignItems: "center" }}>
        {me.avatar_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt={me.github_username ?? "avatar"}
            className="avatar lg"
            src={me.avatar_url}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="avatar lg">{initials}</span>
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: "4px" }}>{me.github_username ?? "(no name)"}</h1>
          <div className="text-muted text-sm mb-8">
            ランキング掲載: <strong style={{ color: me.can_public_ranking ? "var(--success)" : "var(--text-muted)" }}>
              {me.can_public_ranking ? "ON" : "OFF"}
            </strong>
          </div>
          {grade !== null ? (
            <span className={`badge-grade ${gradeBadgeClass(grade.name)}`} data-level={grade.level}>
              {grade.name}
            </span>
          ) : (
            <>
              <span className="badge-grade intern" data-level={1}>Intern</span>
              <span className="text-sm text-muted" style={{ marginLeft: "8px" }}>(まだプレイ実績がありません)</span>
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        <Link className={`tab ${active === "summary" ? "active" : ""}`} href="/mypage">サマリー</Link>
        <Link className={`tab ${active === "rewards" ? "active" : ""}`} href="/mypage/rewards">特典</Link>
        <Link className={`tab ${active === "account" ? "active" : ""}`} href="/mypage/account">設定</Link>
      </div>
    </>
  )
}
