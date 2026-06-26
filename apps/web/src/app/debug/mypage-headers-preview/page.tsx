import Link from "next/link"

/**
 * 一時 debug ページ（PR スクショ用）。
 *
 * mypage は認証必須で Vercel preview では sign-in にリダイレクトされるため、
 * サマリー / 設定 のヘッダー（冗長ボタン削除後）を mock data で単独 render する。
 * スクショ取得後に削除する（proxy の /debug 公開も戻す）。
 */
export default function DebugMypageHeadersPreview() {
  return (
    <div className="container">
      <p className="text-sm text-muted mb-16">
        （debug: 右上「⚙ 設定」/「← マイページに戻る」ボタンを削除した後のヘッダー）
      </p>

      <h2 className="mb-8">サマリー</h2>
      <div className="flex gap-16 mb-24" style={{ alignItems: "center" }}>
        <span className="avatar lg">KE</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: "4px" }}>kentakki416</h1>
          <div className="text-muted text-sm mb-8">
            ランキング掲載: <strong style={{ color: "var(--success)" }}>ON</strong>
          </div>
          <span className="badge-grade intern" data-level={1}>Intern</span>
        </div>
      </div>
      <div className="tabs">
        <Link className="tab active" href="/mypage">サマリー</Link>
        <Link className="tab" href="/mypage/rewards">特典</Link>
        <Link className="tab" href="/mypage/account">設定</Link>
      </div>

      <h2 className="mt-24 mb-8">設定</h2>
      <div className="flex gap-16 mb-24" style={{ alignItems: "center" }}>
        <span className="avatar lg">KE</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: "4px" }}>kentakki416</h1>
          <div className="text-muted text-sm">アカウント設定</div>
        </div>
      </div>
      <div className="tabs">
        <Link className="tab" href="/mypage">サマリー</Link>
        <Link className="tab" href="/mypage/rewards">特典</Link>
        <Link className="tab active" href="/mypage/account">設定</Link>
      </div>
    </div>
  )
}
