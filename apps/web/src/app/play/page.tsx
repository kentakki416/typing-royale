import type { Metadata } from "next"

import { Topbar } from "@/components/topbar"
import { getAccessToken } from "@/libs/auth"

import { LanguageSelector } from "../language-selector"

export const metadata: Metadata = {
  title: "言語選択 - Typing Royale",
}

/**
 * MVP では言語マスタを取得する API がまだ無いため、ハードコードで TypeScript /
 * JavaScript を出す。DB seed の id 1/2 と一致させること
 *
 * JavaScript は問題プールがまだ用意されていないため `comingSoon: true` で
 * カード自体を選択不可（disabled）にする。問題が追加され次第 false に戻す
 */
const SUPPORTED_LANGUAGES = [
  { comingSoon: false, iconClass: "ts", iconText: "TS", id: 1, name: "TypeScript" },
  { comingSoon: true, iconClass: "js", iconText: "JS", id: 2, name: "JavaScript" },
] as const

/**
 * 言語選択画面（mock: language-select.html 準拠）
 *
 * トップ画面（/）からの「▶ ゲストでプレイ」「⚡ 挑戦する」ボタンで遷移する
 */
export default async function PlaySelectPage() {
  const accessToken = await getAccessToken()
  return (
    <>
      <Topbar isAuthed={accessToken !== null} />

      <div className="container container-narrow">
        <h1 className="text-center mt-24">言語を選択</h1>
        <p className="text-muted text-center mb-24">
          120 秒で何文字打てるかを競います。問題は週次クローラが GitHub Star 上位 OSS
          から自動取得した関数です。
        </p>

        <LanguageSelector languages={SUPPORTED_LANGUAGES} />

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
