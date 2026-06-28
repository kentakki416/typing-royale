import type { Metadata } from "next"

import { EmptyLanguagesState } from "@/components/empty-languages-state"
import { Topbar } from "@/components/topbar"
import { getAccessToken } from "@/libs/auth"
import { getLanguages } from "@/libs/languages"

import { LanguageSelector } from "../language-selector"

export const metadata: Metadata = {
  title: "言語選択 - Typing Royale",
}

/**
 * 言語マスタ（API）には無い「表示メタ」を slug で補う。
 * - iconClass / iconText: カードのアイコン表示
 * - comingSoon: 問題プールが未整備の言語はカードを選択不可にする。
 *   問題が追加され次第 false に戻す（または将来は problems の有無で動的判定する）
 * マスタにあるが本マップに無い言語は DEFAULT で comingSoon 扱い（誤って遊ばせない）
 */
const LANGUAGE_PRESENTATION: Record<
  string,
  { comingSoon: boolean; iconClass: string; iconText: string }
> = {
  go: { comingSoon: false, iconClass: "go", iconText: "Go" },
  javascript: { comingSoon: false, iconClass: "js", iconText: "JS" },
  typescript: { comingSoon: false, iconClass: "ts", iconText: "TS" },
}

const DEFAULT_PRESENTATION = { comingSoon: true, iconClass: "code", iconText: "?" }

/**
 * 言語選択画面（mock: language-select.html 準拠）
 *
 * トップ画面（/）からの「▶ ゲストでプレイ」「⚡ 挑戦する」ボタンで遷移する
 */
export default async function PlaySelectPage() {
  const accessToken = await getAccessToken()
  const languages = await getLanguages()

  const selectorLanguages = languages.map((language) => {
    const presentation = LANGUAGE_PRESENTATION[language.slug] ?? DEFAULT_PRESENTATION
    return {
      comingSoon: presentation.comingSoon,
      iconClass: presentation.iconClass,
      iconText: presentation.iconText,
      id: language.id,
      name: language.name,
    }
  })

  return (
    <>
      <Topbar isAuthed={accessToken !== null} />

      <div className="container container-narrow">
        <h1 className="text-center mt-24">言語を選択</h1>
        <p className="text-muted text-center mb-24">
          120 秒で何文字打てるかを競います。問題は週次クローラが GitHub Star 上位 OSS
          から自動取得した関数です。
        </p>

        {selectorLanguages.length === 0 ? (
          <EmptyLanguagesState />
        ) : (
          <LanguageSelector languages={selectorLanguages} />
        )}

        <div className="card god-frame mt-24">
          <div className="flex-center gap-12">
            <div style={{ fontSize: "28px" }}>⚡</div>
            <div style={{ flex: 1 }}>
              <h3
                style={{
                  color: "var(--gold-light)",
                  marginBottom: "4px",
                  textShadow: "0 1px 0 rgba(0,0,0,0.5), 0 0 12px rgba(255, 213, 74, 0.5)",
                }}
              >
                神々に挑戦とは？
              </h3>
              <p className="text-sm text-muted">
                殿堂入りしたユーザーの中から <strong>ランダムに 1 人</strong> を選定して、そのユーザーに挑戦できます。相手は指名できません（運命）。
              </p>
            </div>
          </div>
        </div>

        <div className="card mt-16">
          <div className="card-title mb-8">🎮 ルール</div>
          <ul
            className="text-sm text-muted"
            style={{ display: "grid", gap: "4px", paddingLeft: "18px" }}
          >
            <li>制限時間 <strong>120 秒</strong>、1 関数終わると次が自動で出題</li>
            <li>スコア = 正しく打てた累計文字数 × 正確率</li>
            <li>スキップ機能はなし（引いた関数は完走するか時間切れまで打鍵）</li>
            <li>ペースト無効、依存型は同梱なし（関数本体のみ表示）</li>
          </ul>
        </div>

      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a> · <a href="#">ライセンス一覧</a>
      </div>
    </>
  )
}
