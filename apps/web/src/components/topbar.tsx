import Link from "next/link"

type Props = {
  /**
   * 現在アクティブなナビゲーション項目
   */
  active?: "crawled-repos" | "hall-of-fame" | "home" | "ranking"
  /**
   * 認証状態。true なら右上に「マイページ」、false なら「ログイン」を出し分ける。
   * Topbar は client component (play-loop / result-screen) からも import されるため、
   * 認証チェックは外側で済ませて bool だけ渡す
   */
  isAuthed: boolean
  /**
   * 言語名バッジを表示する（プレイ画面用）
   */
  languageBadge?: string
  /**
   * モード名バッジを表示する（プレイ画面用：「通常モード」/「神々に挑戦」）
   */
  modeBadge?: string
}

/**
 * 全画面共通の Top bar
 * デザイン: docs/mocks/styles.css の .topbar
 */
export function Topbar({ active, isAuthed, languageBadge, modeBadge }: Props) {
  return (
    <nav className="topbar">
      <div className="topbar-left">
        <Link className="logo" href="/">
          <span className="accent">Typing</span> Royale
        </Link>
        {languageBadge && <span className="badge accent">{languageBadge}</span>}
        {modeBadge && <span className="badge">{modeBadge}</span>}
        {!languageBadge && (
          <div className="topbar-nav">
            <Link className={active === "home" ? "active" : ""} href="/">ホーム</Link>
            <Link className={active === "ranking" ? "active" : ""} href="/ranking">ランキング</Link>
            <Link className={active === "hall-of-fame" ? "active" : ""} href="/hall-of-fame">殿堂入り</Link>
            <Link className={active === "crawled-repos" ? "active" : ""} href="/crawled-repos">クロール対象リポジトリ</Link>
          </div>
        )}
      </div>
      <div className="topbar-right">
        {isAuthed ? (
          <Link className="user-chip" href="/mypage" title="マイページ">
            <span className="user-name">マイページ</span>
          </Link>
        ) : (
          <Link className="btn btn-primary" href="/sign-in">
            ログイン
          </Link>
        )}
      </div>
    </nav>
  )
}
