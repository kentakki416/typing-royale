import type { Metadata } from "next"
import Link from "next/link"

import { GetMyRankingResponse, GetUserResponse } from "@repo/api-schema"

import { GradeProgressBar } from "@/components/grade-progress-bar"
import { MyPageHeader } from "@/components/mypage-header"
import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { gradeBadgeClass } from "@/libs/grade"
import { languageBadgeClass } from "@/libs/language-badge"
import { getLanguages } from "@/libs/languages"

export const metadata: Metadata = {
  title: "マイページ - Typing Royale",
}

/**
 * マイページ > ホーム（mock: mypage.html 準拠）
 *
 * 表示要素:
 * - アバター + 表示名 + ランキング掲載 ON/OFF + 全言語通算グレード badge
 * - 3-stat (ベストスコア / 得意なリポジトリ / 平均正確率)。後者2つは /api/user 拡張で集計
 * - エンジニアグレード進捗カード（全言語通算 bestScore ベース）
 * - 苦手文字 top10（生涯累計の誤打数降順）
 * - 全期間ランキング表（言語マスタの各言語別ベスト + 順位 + 状態）
 */
export default async function MyPage() {
  const languages = await getLanguages()
  /** 言語マスタごとに自分の順位を並列 fetch する（特定言語に固定しない） */
  const [me, languageRankings] = await Promise.all([
    apiClient.get<GetUserResponse>("/api/user"),
    Promise.all(
      languages.map(async (language) =>
        apiClient
          .get<GetMyRankingResponse>(`/api/rankings/me?language=${language.slug}`)
          .then((ranking) => ({ language, ranking }))
          .catch(() => ({ language, ranking: null as GetMyRankingResponse | null })),
      ),
    ),
  ])

  /** グレードは全言語通算で同じなので、取得できた最初の言語から取り出す（全滅なら null）*/
  const grade = languageRankings.find((r) => r.ranking)?.ranking?.grade ?? null
  const nextGrade = languageRankings.find((r) => r.ranking)?.ranking?.next_grade ?? null
  const bestScore = Math.max(0, ...languageRankings.map((r) => r.ranking?.best_score ?? 0))

  return (
    <>
      <Topbar isAuthed={true} />

      <div className="container">
        <MyPageHeader active="summary" grade={grade} me={me} />

        <div className="row">
          <div className="col">
            <div className="stat-row">
              <div className="stat">
                <div className="stat-value accent">{bestScore > 0 ? bestScore : "—"}</div>
                <div className="stat-label">ベストスコア</div>
              </div>
              <div className="stat">
                {me.best_repo ? (
                  <a
                    className="stat-value text-mono"
                    href={`https://github.com/${me.best_repo.full_name}`}
                    rel="noreferrer noopener"
                    style={{
                      /**
                       * リポジトリ名は長くなり得るので 34px のままだと折り返す。
                       * フォントは小さくしつつ line-height を数値 stat（34px・行高さ約41px）
                       * に合わせて縦中央寄せし、3 つの stat のラベル位置を揃える
                       */
                      display: "block",
                      fontSize: "18px",
                      lineHeight: "41px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    target="_blank"
                    title={`${me.best_repo.full_name}（平均スコア ${Math.round(me.best_repo.avg_score)}）`}
                  >
                    {me.best_repo.full_name}
                  </a>
                ) : (
                  <div className="stat-value">—</div>
                )}
                <div className="stat-label">得意なリポジトリ</div>
              </div>
              <div className="stat">
                <div className="stat-value success">
                  {me.avg_accuracy > 0 ? `${(me.avg_accuracy * 100).toFixed(1)}%` : "—"}
                </div>
                <div className="stat-label">平均正確率</div>
              </div>
            </div>

            {grade !== null ? (
              <div className="card mb-16" style={{ borderColor: "rgba(189, 147, 249, 0.3)" }}>
                <div className="card-header">
                  <div className="card-title">⚡ エンジニアグレード進捗</div>
                  <span className={`badge-grade ${gradeBadgeClass(grade.name)}`} data-level={grade.level}>
                    {grade.name}
                  </span>
                </div>
                <div className="text-sm mb-8">
                  <div className="flex-between mb-8">
                    <span className="text-muted">現在のベストスコア（全言語通算）</span>
                    <span className="text-mono">{bestScore} pts</span>
                  </div>
                  {nextGrade !== null && (
                    <div className="flex-between">
                      <span className="text-muted">
                        次の <strong style={{ color: "var(--gold-light)" }}>{nextGrade.name}</strong> まで
                      </span>
                      <span className="text-mono" style={{ color: "var(--gold)" }}>
                        あと {nextGrade.score_needed} pts
                      </span>
                    </div>
                  )}
                </div>
                <GradeProgressBar bestScore={bestScore} nextGrade={nextGrade} />
              </div>
            ) : (
              <div className="card mb-16" style={{ borderColor: "rgba(189, 147, 249, 0.3)" }}>
                <div className="card-header">
                  <div className="card-title">⚡ エンジニアグレード進捗</div>
                  <span className="badge-grade intern" data-level={1}>Intern</span>
                </div>
                <p className="text-sm text-muted">
                  1 セッションプレイすると、ベストスコアとグレード進捗が表示されます。
                </p>
              </div>
            )}

            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">📈 全期間ランキング</div>
                <Link className="text-sm" href="/ranking">ランキング全体 →</Link>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>言語</th>
                    <th className="numeric">ベスト</th>
                    <th className="numeric">順位</th>
                    <th className="numeric">プレイ回数</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {languageRankings.map(({ language, ranking }, index) => (
                    <RankingRow
                      key={language.id}
                      badge={languageBadgeClass(language.slug, index)}
                      label={language.name}
                      ranking={ranking}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="col-sidebar">
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">⌨ 苦手文字</div>
              </div>
              {me.weak_chars.length === 0 ? (
                <p className="text-sm text-muted">
                  まだ十分なデータがありません。プレイすると誤打した文字が累積して表示されます。
                </p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {me.weak_chars.map((weak, index) => (
                    <div key={weak.char} style={{ display: "grid", gap: "4px" }}>
                      <div
                        className="flex-between"
                        style={{ alignItems: "center", gap: "10px" }}
                      >
                        <span
                          className="text-mono"
                          style={{
                            color: "var(--text-secondary)",
                            minWidth: "16px",
                            textAlign: "right",
                          }}
                        >
                          {index + 1}
                        </span>
                        <span
                          className="text-mono"
                          style={{
                            background: "var(--bg-base)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            minWidth: "28px",
                            padding: "2px 8px",
                            textAlign: "center",
                          }}
                        >
                          {displayChar(weak.char)}
                        </span>
                        <div
                          style={{
                            background: "var(--bg-base)",
                            borderRadius: "4px",
                            flex: 1,
                            height: "8px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              background: "var(--error)",
                              height: "100%",
                              width: `${(weak.count / me.weak_chars[0].count) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-muted text-mono">{weak.count}</span>
                      </div>
                      {weak.mistyped.length > 0 && (
                        <div className="text-sm text-muted" style={{ paddingLeft: "26px" }}>
                          実際は{" "}
                          {weak.mistyped.map((m, i) => (
                            <span className="text-mono" key={m.char}>
                              {i > 0 ? " ・ " : ""}
                              {displayChar(m.char)} ×{m.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

/**
 * 苦手文字の表示用変換。空白・タブ・改行・内訳不明は見やすい記号に置き換える
 */
const displayChar = (char: string): string => {
  if (char === " ") return "␣"
  if (char === "\t") return "⇥"
  if (char === "\n") return "⏎"
  if (char === "?") return "不明"
  return char
}

/**
 * 全期間ランキング表の 1 行
 * 「圏内 / 圏外」境界は UX 都合で 1000 位（リアルタイム集計でも閾値表記は残す）
 */
const RankingRow = ({ badge, label, ranking }: {
    badge: string
    label: string
    ranking: GetMyRankingResponse | null
}) => {
  if (ranking === null || ranking.rank === null || ranking.best_score === null) {
    return (
      <tr>
        <td><span className={`badge ${badge}`}>{label}</span></td>
        <td className="numeric text-muted">—</td>
        <td className="numeric text-muted">—</td>
        <td className="numeric text-muted">—</td>
        <td><span className="badge">未プレイ</span></td>
      </tr>
    )
  }
  const inRange = ranking.rank <= 1000
  return (
    <tr>
      <td><span className={`badge ${badge}`}>{label}</span></td>
      <td className="numeric"><strong>{ranking.best_score}</strong></td>
      <td className="numeric">
        <strong style={{ color: "var(--accent)" }}>#{ranking.rank}</strong>
      </td>
      <td className="numeric">{ranking.play_count.toLocaleString()} 回</td>
      <td>
        <span className={`badge ${inRange ? "success" : "warning"}`}>
          {inRange ? "圏内" : "圏外（1000位以下）"}
        </span>
      </td>
    </tr>
  )
}
