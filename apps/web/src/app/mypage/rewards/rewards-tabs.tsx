"use client"

import Link from "next/link"
import { useState } from "react"

import type { GetMyRewardsResponse } from "@repo/api-schema"

import { downloadFile } from "@/libs/download-file"

type Reward = GetMyRewardsResponse["rewards"][number]

type Props = {
    apiUrl: string
    rewards: Reward[]
}

type TabKey = "grade_up" | "hall_of_fame_in" | "monthly_top_ten"

const TABS: Array<{ icon: string; key: TabKey; label: string }> = [
  { icon: "🚀", key: "grade_up", label: "グレードアップ" },
  { icon: "👑", key: "hall_of_fame_in", label: "殿堂入り" },
  { icon: "🏆", key: "monthly_top_ten", label: "月間 TOP 10" },
]

/**
 * マイページ「特典」タブの中身。3 種別タブで分類して表示。詳細は
 * docs/spec/special-badges/step6-web-mypage-rewards-tabs.md
 */
export function RewardsTabs({ apiUrl, rewards }: Props) {
  const [active, setActive] = useState<TabKey>(() => {
    /** 件数が多い種別を初期表示にする (空 → grade_up) */
    const counts: Record<TabKey, number> = {
      grade_up: 0,
      hall_of_fame_in: 0,
      monthly_top_ten: 0,
    }
    for (const r of rewards) {
      const k = r.type as TabKey
      if (k in counts) counts[k] += 1
    }
    const top = (Object.entries(counts) as Array<[TabKey, number]>)
      .sort((a, b) => b[1] - a[1])[0]
    return top !== undefined && top[1] > 0 ? top[0] : "grade_up"
  })

  const grouped: Record<TabKey, Reward[]> = {
    grade_up: rewards.filter((r) => r.type === "grade_up"),
    hall_of_fame_in: rewards.filter((r) => r.type === "hall_of_fame_in"),
    monthly_top_ten: rewards.filter((r) => r.type === "monthly_top_ten"),
  }

  const list = grouped[active]

  return (
    <>
      <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            aria-pressed={active === t.key}
            className={active === t.key ? "btn btn-primary" : "btn"}
            key={t.key}
            onClick={() => setActive(t.key)}
            type="button"
          >
            {t.icon} {t.label}（{grouped[t.key].length}）
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card text-center" style={{ padding: "48px 16px" }}>
          <div className="text-mono text-muted mb-16">この種別の特典はまだありません</div>
          <p className="text-sm text-muted mb-16">
            {active === "grade_up" && "グレードアップすると達成カードが自動生成されます"}
            {active === "hall_of_fame_in" && "全期間 TOP 10 入賞時に殿堂入りバッジが生成されます"}
            {active === "monthly_top_ten" && "月間 TOP 10 入賞時に月間バッジが生成されます"}
          </p>
          <Link className="btn btn-primary btn-play" href="/play">
            ▶ プレイ開始
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          }}
        >
          {list.map((r) => (
            <RewardCard apiUrl={apiUrl} key={r.reward_id} reward={r} />
          ))}
        </div>
      )}
    </>
  )
}

type CardProps = {
    apiUrl: string
    reward: Reward
}

function RewardCard({ apiUrl, reward }: CardProps) {
  const fullAssetUrl = reward.asset_url === null
    ? null
    : reward.asset_url.startsWith("http")
      ? reward.asset_url
      : `${apiUrl}${reward.asset_url}`
  const svgDataUrl = reward.asset_svg_url === null
    ? null
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(reward.asset_svg_url)}`

  const grantedYmd = new Date(reward.granted_at).toISOString().slice(0, 10)
  const label = formatRewardLabel(reward)

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{label}</div>
        <span className="text-sm text-muted">{grantedYmd}</span>
      </div>
      {fullAssetUrl === null ? (
        <div className="text-sm text-muted text-center" style={{ padding: "32px 0" }}>
          画像生成中（しばらく待つか再度開いてください）
        </div>
      ) : (
        <>
          <div className="reward-asset-label">PNG</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={label}
            src={fullAssetUrl}
            style={{
              background: "var(--bg-surface-2)",
              borderRadius: "4px",
              width: "100%",
            }}
          />
        </>
      )}
      {reward.asset_svg_url !== null && (
        <>
          <div className="reward-asset-label">SVG</div>
          <div
            aria-label={`${label} SVG プレビュー`}
            className="reward-svg"
            dangerouslySetInnerHTML={{ __html: reward.asset_svg_url }}
          />
        </>
      )}
      <div className="flex gap-8 mt-8" style={{ flexWrap: "wrap" }}>
        {fullAssetUrl !== null && (
          <button
            className="btn"
            onClick={() => {
              void downloadFile(
                fullAssetUrl,
                `typing-royale-${reward.type}-${reward.reward_id}.png`,
              ).catch(() => {
                /** CORS 未反映等で失敗したら画像を別タブで開くフォールバック */
                window.open(fullAssetUrl, "_blank", "noopener,noreferrer")
              })
            }}
            type="button"
          >
            PNG DL
          </button>
        )}
        {svgDataUrl !== null && (
          <a
            className="btn"
            download={`typing-royale-${reward.type}-${reward.reward_id}.svg`}
            href={svgDataUrl}
          >
            SVG DL
          </a>
        )}
      </div>
    </div>
  )
}

const formatRewardLabel = (reward: Reward): string => {
  if (reward.type === "grade_up") {
    const slug = (reward.payload as { grade_slug?: string }).grade_slug ?? ""
    const name = GRADE_NAMES[slug] ?? slug
    return `🚀 ${name} 昇格`
  }
  if (reward.type === "hall_of_fame_in") {
    const p = reward.payload as { language?: string; rank?: number }
    return `👑 殿堂入り #${p.rank ?? "?"} (${formatLanguage(p.language)})`
  }
  if (reward.type === "monthly_top_ten") {
    const p = reward.payload as { language?: string; rank?: number; year_month?: string }
    const ym = (p.year_month ?? "").replace("-", ".")
    return `🏆 ${ym} 月間 #${p.rank ?? "?"} (${formatLanguage(p.language)})`
  }
  if (reward.type === "card") {
    const labelStr = (reward.payload as { milestone_label?: string }).milestone_label ?? "達成"
    return `🎖 ${labelStr}`
  }
  return reward.type
}

const formatLanguage = (lang: string | undefined): string =>
  lang === "javascript" ? "JS" : lang === "typescript" ? "TS" : lang === "go" ? "Go" : "?"

const GRADE_NAMES: Record<string, string> = {
  distinguished: "Distinguished Engineer",
  fellow: "Fellow",
  intern: "Intern",
  junior: "Junior Developer",
  mid: "Mid Developer",
  principal: "Principal Engineer",
  senior: "Senior Engineer",
  staff: "Staff Engineer",
}
