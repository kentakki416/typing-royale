import type { GetMonthlyRankingsResponse } from "@repo/api-schema"

type Props = {
  data: GetMonthlyRankingsResponse
  /** 表示用の言語ラベル (例: "TypeScript") */
  language: string
}

/**
 * ホーム画面の「月間トップ」カード内の 1 言語ぶん。
 *
 * data.entries が空 / API 失敗時のフォールバック (year_month が空文字) の場合は
 * 状態に応じた空表示を出す
 */
export function MonthlyTopCard({ data, language }: Props) {
  const monthLabel = data.year_month === "" ? "" : formatYearMonthJa(data.year_month)

  return (
    <div>
      <div className="flex-between mb-8">
        <div className="text-sm" style={{ fontWeight: 600 }}>{language}</div>
        {monthLabel !== "" && <div className="text-xs text-muted">{monthLabel}</div>}
      </div>

      {data.entries.length === 0 ? (
        <div className="text-sm text-muted text-center" style={{ padding: "24px 0" }}>
          {data.year_month === "" ? "集計準備中" : "まだエントリがありません"}
        </div>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data.entries.map((entry) => (
            <li
              className="flex-between"
              key={entry.user.id}
              style={{
                alignItems: "center",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                gap: "8px",
                padding: "8px 0",
              }}
            >
              <div className="flex gap-8" style={{ alignItems: "center", minWidth: 0 }}>
                <span
                  className="text-mono text-muted"
                  style={{ minWidth: "20px", textAlign: "right" }}
                >
                  {entry.rank}
                </span>
                <span
                  className="player-name"
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {entry.user.display_name}
                </span>
              </div>
              <div className="text-mono text-sm" style={{ flexShrink: 0 }}>
                {entry.score.toLocaleString()}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const formatYearMonthJa = (yearMonth: string): string => {
  const [y, m] = yearMonth.split("-")
  return `${y} 年 ${Number(m)} 月`
}
