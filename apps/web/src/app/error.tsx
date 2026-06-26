"use client"

import Link from "next/link"
import { useEffect } from "react"

/**
 * ルートセグメントのエラー境界。
 * SSR / レンダリング中に throw された想定外エラー（API が 5xx を返した等）を捕捉し、
 * デフォルトの汎用画面の代わりにブランドされた 500 ページを表示する。
 * Client Component 必須（reset で再試行できるようにするため）。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        minHeight: "100dvh",
        padding: "24px",
      }}
    >
      <div className="card text-center" style={{ maxWidth: "480px", width: "100%" }}>
        <div
          style={{
            color: "var(--error)",
            fontSize: "64px",
            fontWeight: 700,
            letterSpacing: "0.05em",
            lineHeight: 1,
          }}
        >
          500
        </div>

        <h1 style={{ fontSize: "18px", fontWeight: 600, marginTop: "16px" }}>
          サーバーエラーが発生しました
        </h1>

        <p className="text-muted mt-8" style={{ fontSize: "13px", lineHeight: 1.7 }}>
          問題が発生してページを読み込めませんでした。
          <br />
          少し時間をおいて再度お試しください。
        </p>

        <pre
          className="mt-16"
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text-secondary)",
            fontSize: "12px",
            margin: "16px 0 0",
            overflowX: "auto",
            padding: "12px 14px",
            textAlign: "left",
          }}
        >
          <span style={{ color: "var(--error)" }}>$</span> Error: Internal Server Error
          {error.digest ? `\n  digest: ${error.digest}` : ""}
        </pre>

        <div
          className="flex-center mt-24"
          style={{ flexWrap: "wrap", justifyContent: "center" }}
        >
          <button className="btn btn-primary" onClick={reset} type="button">
            再読み込み
          </button>
          <Link className="btn" href="/">
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  )
}
