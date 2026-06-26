import Link from "next/link"

/**
 * 404 ページ。存在しない URL や notFound() 呼び出し時に表示する。
 * error.tsx と同じトーンで揃える（Server Component で良い）。
 */
export default function NotFound() {
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
            color: "var(--accent)",
            fontSize: "64px",
            fontWeight: 700,
            letterSpacing: "0.05em",
            lineHeight: 1,
          }}
        >
          404
        </div>

        <h1 style={{ fontSize: "18px", fontWeight: 600, marginTop: "16px" }}>
          ページが見つかりません
        </h1>

        <p className="text-muted mt-8" style={{ fontSize: "13px", lineHeight: 1.7 }}>
          お探しのページは存在しないか、移動した可能性があります。
        </p>

        <div className="mt-24">
          <Link className="btn btn-primary" href="/">
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  )
}
