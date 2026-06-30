import Link from "next/link"

import { formatPlayedAtDate } from "@/libs/format-date"
import { resolveRepoLink } from "@/libs/repo-link"

type Props = {
  achievedAt?: string | null
  avatarUrl: string | null
  bestPlaySessionId: number | null
  accuracy: number
  /** このベストを出したときの出題元 OSS リポジトリ (owner/repo) */
  crawledRepoFullName?: string | null
  favoriteRepoUrl: string | null
  gradeSlug: string
  rankBadgeClassName?: string
  rankLabel: string
  score: number
  typedChars: number
  username: string
}

/**
 * ランキング / 殿堂入りで「他ユーザーを選択したとき」に表示する共通プロフィールカード。
 *
 * 上から、出題リポジトリ + 達成日（どこでいつベストを出したか）→ ベストスコア /
 * 正解率 / 最高打点数の横一列スタッツ → お気に入りリポジトリ → リプレイリンク、
 * の順で並べる。中身はランキングからでも殿堂入りからでも同一にし、外側のラッパー
 * （カーテン演出 or プレーンモーダル）でのみ見せ方を変える。
 */
export function UserProfileCard({
  achievedAt = null,
  avatarUrl,
  bestPlaySessionId,
  accuracy,
  crawledRepoFullName = null,
  favoriteRepoUrl,
  gradeSlug,
  rankBadgeClassName = "badge",
  rankLabel,
  score,
  typedChars,
  username,
}: Props) {
  const repo = resolveRepoLink(favoriteRepoUrl, username)

  return (
    <>
      <div className="text-center">
        <PlayerAvatar avatarUrl={avatarUrl} username={username} />
        <h2 style={{ fontSize: "28px", margin: "16px 0 6px" }}>@{username}</h2>
        <div className="flex gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
          <span className={rankBadgeClassName}>{rankLabel}</span>
          <span className={`badge-grade ${gradeSlug}`} data-level={GRADE_LEVELS[gradeSlug] ?? 1}>
            {gradeDisplayName(gradeSlug)}
          </span>
        </div>
      </div>

      {(crawledRepoFullName !== null || achievedAt !== null) && (
        <div className="card mt-24" style={{ display: "grid", gap: "10px", padding: "16px 18px" }}>
          {crawledRepoFullName !== null && (
            <div>
              <div className="card-title text-sm mb-8" style={{ color: "var(--accent)" }}>📦 出題リポジトリ</div>
              <a
                className="text-mono text-sm"
                href={`https://github.com/${crawledRepoFullName}`}
                rel="noreferrer noopener"
                target="_blank"
              >
                {crawledRepoFullName}
              </a>
            </div>
          )}
          {achievedAt !== null && (
            <div className="text-xs text-muted">
              📅 達成日: {formatPlayedAtDate(achievedAt)}
            </div>
          )}
        </div>
      )}

      <div className="stat-row stat-row-compact mt-16">
        <div className="stat">
          <div className="stat-value accent">{score.toLocaleString()}</div>
          <div className="stat-label">ベストスコア</div>
        </div>
        <div className="stat">
          <div className="stat-value success">{(accuracy * 100).toFixed(1)}%</div>
          <div className="stat-label">正解率</div>
        </div>
        <div className="stat">
          <div className="stat-value">{typedChars.toLocaleString()}</div>
          <div className="stat-label">最高打点数</div>
        </div>
      </div>

      <div className="card mt-16" style={{ padding: "16px 18px" }}>
        <div className="card-title text-sm mb-8" style={{ color: "var(--accent)" }}>🔗 お気に入りリポジトリ</div>
        <a
          className="text-mono text-sm"
          href={repo.href}
          rel="noreferrer noopener"
          target="_blank"
        >
          {repo.label}
        </a>
      </div>

      {bestPlaySessionId !== null && (
        <div className="flex gap-12 mt-24" style={{ flexWrap: "wrap", justifyContent: "center" }}>
          <Link className="btn btn-primary" href={`/replay/${bestPlaySessionId}`}>
            ▶ リプレイを見る
          </Link>
        </div>
      )}
    </>
  )
}

const PlayerAvatar = ({ avatarUrl, username }: { avatarUrl: string | null; username: string }) => {
  const initials = username.slice(0, 2).toUpperCase()
  const style = { fontSize: "30px", height: "96px", margin: "0 auto", width: "96px" }
  if (avatarUrl === null) {
    return <span className="avatar lg" style={style}>{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={username} className="avatar lg" src={avatarUrl} style={style} />
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

const GRADE_DISPLAY_NAMES: Record<string, string> = {
  distinguished: "Distinguished Engineer",
  fellow: "Fellow",
  intern: "Intern",
  junior: "Junior Developer",
  mid: "Mid Developer",
  principal: "Principal Engineer",
  senior: "Senior Engineer",
  staff: "Staff Engineer",
}

const gradeDisplayName = (slug: string): string => GRADE_DISPLAY_NAMES[slug] ?? slug
