import Link from "next/link"

/**
 * 全ページ共通フッター（root layout から 1 箇所だけ描画する）。
 *
 * - プライバシー: AdSense 審査・運用でサイト全体から到達可能であることが必要
 * - ライセンス一覧: 問題は OSS の関数を出題するため、採用ライセンスの全文参照を掲載
 *   （docs/spec/problem-pool「ライセンス管理」要件）
 */
export function Footer() {
  return (
    <footer className="footer">
      <Link href="/privacy">プライバシー</Link>
      {" · "}
      <Link href="/licenses">ライセンス一覧</Link>
    </footer>
  )
}
