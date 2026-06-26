"use client"

/**
 * root layout 自体が落ちたときのフォールバック。
 * root layout を置き換えるため globals.css / フォントが効かない前提で、
 * スタイルは self-contained（インライン）にする。<html>/<body> を自前で持つ必要がある。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ja">
      <body
        style={{
          alignItems: "center",
          background: "#0d1117",
          color: "#e6edf3",
          display: "flex",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          justifyContent: "center",
          margin: 0,
          minHeight: "100dvh",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "480px", textAlign: "center", width: "100%" }}>
          <div style={{ color: "#f85149", fontSize: "64px", fontWeight: 700, lineHeight: 1 }}>
            500
          </div>
          <h1 style={{ fontSize: "18px", fontWeight: 600, marginTop: "16px" }}>
            サーバーエラーが発生しました
          </h1>
          <p style={{ color: "#8b949e", fontSize: "13px", lineHeight: 1.7, marginTop: "8px" }}>
            問題が発生してページを読み込めませんでした。少し時間をおいて再度お試しください。
          </p>
          {error.digest ? (
            <p style={{ color: "#6e7681", fontSize: "12px", marginTop: "12px" }}>
              エラーID: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              background: "#1f6feb",
              border: "1px solid #1f5fbf",
              borderRadius: "10px",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "14px",
              marginTop: "24px",
              padding: "12px 24px",
            }}
            type="button"
          >
            再読み込み
          </button>
        </div>
      </body>
    </html>
  )
}
