import type { Metadata } from "next"

import { Topbar } from "@/components/topbar"
import { getAccessToken } from "@/libs/auth"

export const metadata: Metadata = {
  description: "Typing Royale のプライバシーポリシー（Cookie・Google AdSense 広告配信に関する説明を含む）",
  title: "プライバシーポリシー | Typing Royale",
}

/**
 * プライバシーポリシー。
 *
 * Google AdSense の審査では「Cookie・広告配信事業者による情報利用」の明示が必須のため、
 * 広告導入と同じタイミングで用意する。連絡先など要差し替え箇所は {{ }} で示す。
 */
export default async function PrivacyPolicyPage() {
  const isAuthed = (await getAccessToken()) !== null

  return (
    <>
      <Topbar isAuthed={isAuthed} />

      <div className="container container-narrow" style={{ paddingBottom: 64 }}>
        <h1 className="mt-24 mb-8">プライバシーポリシー</h1>
        <p className="text-sm text-muted mb-24">最終更新日: 2026 年 6 月 27 日</p>

        <section className="card mb-16">
          <h2 className="mb-8">1. はじめに</h2>
          <p className="text-sm">
            Typing Royale（以下「本サイト」）は、利用者のプライバシーを尊重し、個人情報および
            利用状況に関する情報を適切に取り扱います。本ポリシーは、本サイトが取得する情報と
            その利用目的、第三者への提供について説明します。
          </p>
        </section>

        <section className="card mb-16">
          <h2 className="mb-8">2. 取得する情報</h2>
          <ul className="text-sm" style={{ paddingLeft: 20, lineHeight: 1.9 }}>
            <li>GitHub OAuth ログイン時に取得する公開プロフィール情報（ユーザー名・アバター等）</li>
            <li>タイピングのスコア・プレイ記録などサービス提供に必要なデータ</li>
            <li>アクセス時のブラウザ情報・Cookie・閲覧履歴などの利用状況データ</li>
          </ul>
        </section>

        <section className="card mb-16">
          <h2 className="mb-8">3. Cookie と広告配信について</h2>
          <p className="text-sm mb-8">
            本サイトは、第三者配信の広告サービス「Google AdSense」を利用しています。
            Google などの第三者配信事業者は Cookie を使用して、利用者の興味に応じた広告を
            表示することがあります。
          </p>
          <p className="text-sm mb-8">
            Cookie を無効にする方法および Google AdSense に関する詳細は、以下をご確認ください。
          </p>
          <ul className="text-sm" style={{ paddingLeft: 20, lineHeight: 1.9 }}>
            <li>
              <a
                href="https://policies.google.com/technologies/ads"
                rel="noopener noreferrer"
                target="_blank"
              >
                Google の広告に関するポリシー
              </a>
            </li>
            <li>
              <a
                href="https://www.google.com/settings/ads"
                rel="noopener noreferrer"
                target="_blank"
              >
                広告のパーソナライズ設定（オプトアウト）
              </a>
            </li>
          </ul>
        </section>

        <section className="card mb-16">
          <h2 className="mb-8">4. アクセス解析ツール</h2>
          <p className="text-sm">
            本サイトは、サービス改善のためアクセス解析ツールを利用する場合があります。
            これらのツールはトラフィックデータ収集のために Cookie を使用しますが、
            このデータは匿名で収集され、個人を特定するものではありません。
          </p>
        </section>

        <section className="card mb-16">
          <h2 className="mb-8">5. 免責事項・ポリシーの変更</h2>
          <p className="text-sm">
            本サイトに掲載される情報やリンク先で提供される情報の正確性について保証するものではありません。
            また、本ポリシーは予告なく変更されることがあります。変更後の内容は本ページに掲載した時点で
            効力を生じるものとします。
          </p>
        </section>

        <section className="card">
          <h2 className="mb-8">6. お問い合わせ</h2>
          <p className="text-sm">
            本ポリシーに関するお問い合わせは{" "}
            <a href="mailto:fujimorikenta@icloud.com">fujimorikenta@icloud.com</a> までご連絡ください。
          </p>
        </section>
      </div>

      <div className="footer">
        <a href="/privacy">プライバシー</a>
      </div>
    </>
  )
}
