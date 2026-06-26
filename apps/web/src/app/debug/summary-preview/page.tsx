import Link from "next/link"

/**
 * 一時 debug ページ（PR スクショ用）。
 * mypage は認証必須で preview では sign-in に飛ぶため、サマリーの新 stat 行
 * （ベストスコア / 得意なリポジトリ / 平均正確率）と苦手文字 top10 を mock で render する。
 * スクショ取得後に削除する（proxy の /debug 公開も戻す）。
 */
const WEAK = [
  { char: "e", count: 42 },
  { char: "t", count: 38 },
  { char: " ", count: 31 },
  { char: "a", count: 27 },
  { char: "n", count: 22 },
  { char: "i", count: 19 },
  { char: "s", count: 16 },
  { char: "r", count: 14 },
  { char: "o", count: 11 },
  { char: "l", count: 8 },
]

const displayChar = (char: string): string => (char === " " ? "␣" : char)

export default function DebugSummaryPreview() {
  return (
    <div className="container">
      <h1 className="mb-16">サマリー</h1>
      <div className="tabs mb-24">
        <Link className="tab active" href="/mypage">サマリー</Link>
        <Link className="tab" href="/mypage/rewards">特典</Link>
        <Link className="tab" href="/mypage/account">設定</Link>
      </div>

      <div className="row">
        <div className="col">
          <div className="stat-row">
            <div className="stat">
              <div className="stat-value accent">543</div>
              <div className="stat-label">ベストスコア</div>
            </div>
            <div className="stat">
              <a
                className="stat-value text-mono"
                href="https://github.com/microsoft/TypeScript"
                rel="noreferrer noopener"
                style={{
                  display: "block",
                  fontSize: "15px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                target="_blank"
              >
                microsoft/TypeScript
              </a>
              <div className="stat-label">得意なリポジトリ</div>
            </div>
            <div className="stat">
              <div className="stat-value success">94.2%</div>
              <div className="stat-label">平均正確率</div>
            </div>
          </div>
        </div>

        <aside className="col-sidebar">
          <div className="card mb-16">
            <div className="card-header">
              <div className="card-title">⌨ 苦手文字</div>
            </div>
            <div style={{ display: "grid", gap: "10px" }}>
              {WEAK.map((weak, index) => (
                <div
                  key={weak.char}
                  className="flex-between"
                  style={{ alignItems: "center", gap: "10px" }}
                >
                  <span
                    className="text-mono"
                    style={{ color: "var(--text-secondary)", minWidth: "16px", textAlign: "right" }}
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
                        width: `${(weak.count / WEAK[0].count) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-muted text-mono">{weak.count}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
