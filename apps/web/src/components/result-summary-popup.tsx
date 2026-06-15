"use client"

import { useEffect } from "react"

import type { FinishPlaySessionResponse, GetMyRankingResponse } from "@repo/api-schema"

type Props = {
  /**
   * /api/internal/my-ranking の結果。ゲスト時 / 取得失敗時は null
   */
  myRanking: GetMyRankingResponse | null
  /**
   * 閉じる操作（背景クリック / Esc）
   */
  onClose: () => void
  /**
   * /finish のレスポンス
   */
  result: FinishPlaySessionResponse
}

/**
 * セッション完了直後の結果サマリーポップアップ。
 * - 上: ランキング / スコア / よく間違える文字 をラベル上・値下の縦並び（中央寄せ）
 * - 下: 累計文字数 / 正確率 / 完走関数数 / 出題数 を 4 ブロック並べる
 * 背景クリック / Esc で閉じて、裏の詳細 ResultScreen へ
 */
export function ResultSummaryPopup({ myRanking, onClose, result }: Props) {
  const topMistypes = Object.entries(result.mistype_stats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      aria-modal="true"
      onClick={onClose}
      role="dialog"
      style={{
        alignItems: "center",
        background: "rgba(5, 8, 13, 0.5)",
        cursor: "pointer",
        display: "flex",
        height: "100vh",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 900,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          cursor: "auto",
          maxWidth: "460px",
          padding: "32px",
          width: "calc(100vw - 48px)",
        }}
      >
        {/* ランキング */}
        <Block label="ランキング">
          <span className="text-mono" style={{ color: "var(--accent)", fontSize: "28px", fontWeight: 700 }}>
            {result.new_rank !== null ? `#${result.new_rank}` : "—"}
          </span>
          {myRanking !== null && result.new_rank !== null && (
            <span className="text-muted text-sm" style={{ marginLeft: "8px" }}>
              / {myRanking.total_ranked_players.toLocaleString()} 人
            </span>
          )}
        </Block>

        {/* スコア */}
        <Block label="スコア">
          <span className="text-mono" style={{ fontSize: "32px", fontWeight: 700 }}>
            {result.score}
            <span className="text-muted" style={{ fontSize: "16px" }}> pts</span>
          </span>
        </Block>

        {/* よく間違える文字 */}
        <Block label="よく間違える文字">
          {topMistypes.length === 0 ? (
            <span className="text-muted text-sm">なし</span>
          ) : (
            <div className="flex gap-12" style={{ flexWrap: "wrap", justifyContent: "center" }}>
              {topMistypes.map(([char, count]) => (
                <span key={char} style={{ alignItems: "center", display: "inline-flex", gap: "4px" }}>
                  <code className="inline">{char === " " ? "␣" : char}</code>
                  <span className="text-muted text-sm">×{count}</span>
                </span>
              ))}
            </div>
          )}
        </Block>

        {/* 下: 3 ブロック（小さめ）。stat-row より小さい自前レイアウトで詰める */}
        <div
          style={{
            display: "grid",
            gap: "8px",
            gridTemplateColumns: "repeat(3, 1fr)",
            marginTop: "16px",
          }}
        >
          <MiniStat color="var(--accent)" label="累計文字数" value={result.typed_chars} />
          <MiniStat color="var(--success)" label="正確率" value={`${(result.accuracy * 100).toFixed(1)}%`} />
          <MiniStat label="出題数" value={result.problems_played} />
        </div>
      </div>
    </div>
  )
}

/**
 * ラベル上・値下の縦並び中央寄せ。1 ブロック分のレイアウト
 */
const Block = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className="text-center" style={{ padding: "10px 0" }}>
    <div className="text-muted text-sm" style={{ marginBottom: "4px" }}>{label}</div>
    <div>{children}</div>
  </div>
)

/**
 * 小さめの stat ブロック（stat-row より一回り小さく詰める）
 */
const MiniStat = ({ color, label, value }: { color?: string; label: string; value: number | string }) => (
  <div
    className="text-center"
    style={{
      background: "rgba(255, 255, 255, 0.03)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      borderRadius: "6px",
      padding: "8px 4px",
    }}
  >
    <div className="text-mono" style={{ color: color ?? "var(--text-primary)", fontSize: "16px", fontWeight: 700, lineHeight: 1.1 }}>
      {value}
    </div>
    <div className="text-muted" style={{ fontSize: "11px", marginTop: "2px" }}>{label}</div>
  </div>
)
