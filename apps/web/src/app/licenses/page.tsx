import type { Metadata } from "next"

import { Topbar } from "@/components/topbar"
import { getAccessToken } from "@/libs/auth"

export const metadata: Metadata = {
  description: "Typing Royale が出題に利用している OSS のライセンス（MIT / Apache-2.0 / BSD-3-Clause / ISC）と著作権の取り扱いについて",
  title: "ライセンス | Typing Royale",
}

/**
 * 採用 OSS ライセンスの全文（一次情報）への参照リンク。
 * docs/spec/problem-pool「ライセンス管理」の「ライセンス全文への参照リンクをフッターに掲載」要件に対応する。
 */
const LICENSES = [
  {
    id: "mit",
    name: "MIT License",
    spdx: "MIT",
    url: "https://opensource.org/license/mit",
  },
  {
    id: "apache-2.0",
    name: "Apache License 2.0",
    spdx: "Apache-2.0",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
  },
  {
    id: "bsd-3-clause",
    name: "BSD 3-Clause License",
    spdx: "BSD-3-Clause",
    url: "https://opensource.org/license/bsd-3-clause",
  },
  {
    id: "isc",
    name: "ISC License",
    spdx: "ISC",
    url: "https://opensource.org/license/isc-license-txt",
  },
]

/**
 * ライセンス一覧ページ。
 *
 * Typing Royale の問題は GitHub 上の OSS から自動抽出した関数で、対象は寛容な
 * ライセンス（MIT / Apache-2.0 / BSD-3-Clause / ISC）のみ。著作権は各 OSS の権利者に
 * 帰属することと、ライセンス全文への参照を明示する。
 */
export default async function LicensesPage() {
  const isAuthed = (await getAccessToken()) !== null

  return (
    <>
      <Topbar isAuthed={isAuthed} />

      <div className="container container-narrow" style={{ paddingBottom: 64 }}>
        <h1 className="mt-24 mb-8">ライセンス</h1>
        <p className="text-sm text-muted mb-24">最終更新日: 2026 年 6 月 28 日</p>

        <section className="card mb-16">
          <h2 className="mb-8">1. 出題コードの出典について</h2>
          <p className="text-sm mb-8">
            Typing Royale の問題は、GitHub の Star 上位リポジトリから自動抽出した実在の
            関数本体です。出題対象は、再配布・改変が認められた寛容な OSS ライセンス
            （MIT / Apache-2.0 / BSD-3-Clause / ISC）のリポジトリに限定しています。
          </p>
          <p className="text-sm">
            各問題には、プレイ画面・リプレイ画面で <strong>出典リポジトリ / ファイルパス /
              行範囲 / ライセンス名 / コミット SHA / 関数名</strong> を表示し、出典を明示しています。
          </p>
        </section>

        <section className="card mb-16">
          <h2 className="mb-8">2. 著作権の帰属</h2>
          <p className="text-sm">
            出題に用いる各 OSS のソースコードの著作権は、それぞれのリポジトリの権利者に帰属します。
            Typing Royale はそれらのコードを各ライセンスの条件に従って利用しており、著作権を主張するものではありません。
          </p>
        </section>

        <section className="card mb-16">
          <h2 className="mb-8">3. 採用ライセンスと全文</h2>
          <p className="text-sm mb-8">出題対象としているライセンスと、その全文（一次情報）へのリンクです。</p>
          <ul className="text-sm" style={{ lineHeight: 1.9, paddingLeft: 20 }}>
            {LICENSES.map((license) => (
              <li key={license.id}>
                <a href={license.url} rel="noopener noreferrer" target="_blank">
                  {license.name}
                </a>{" "}
                <span className="text-muted">（SPDX: {license.spdx}）</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb-8">4. 権利者の方へ・お問い合わせ</h2>
          <p className="text-sm">
            出典表示の誤りや、掲載の停止のご希望など、ライセンスに関するお問い合わせは{" "}
            <a href="mailto:fujimorikenta@icloud.com">fujimorikenta@icloud.com</a> までご連絡ください。速やかに対応します。
          </p>
        </section>
      </div>
    </>
  )
}
