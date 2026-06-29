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
        <h1 className="text-center mt-24 mb-24">言語を選択</h1>

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
                殿堂入りしたユーザーの中から <strong>ランダムに 1 人</strong> を選定して、そのユーザーに挑戦できます。あなたは神々に勝てますか？
              </p>
            </div>
          </div>
        </div>

        <div className="card mt-16">
          <div className="card-title mb-8">🎮 詳しいルール</div>
          <div className="text-sm text-muted" style={{ display: "grid", gap: "14px" }}>
            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "4px" }}>
                ⏱ 制限時間とコンボボーナス
              </div>
              <ul style={{ display: "grid", gap: "4px", margin: 0, paddingLeft: "18px" }}>
                <li>持ち時間は <strong>120 秒</strong>。1 つの関数を打ち終えると自動で次の問題に進みます。</li>
                <li>
                  連続正解（コンボ）が続くとボーナス時間を獲得：
                  <strong>30 コンボで +1 秒・60 コンボで +2 秒・90 コンボ以降は 30 コンボごとに +3 秒</strong>。
                </li>
                <li>コンボが途切れても、再びマイルストーンに達すれば<strong>何度でも</strong>加算されます（上限なし）。</li>
              </ul>
            </div>

            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "4px" }}>
                🏅 スコアの決まり方
              </div>
              <ul style={{ display: "grid", gap: "4px", margin: 0, paddingLeft: "18px" }}>
                <li>スコア = <strong>正しく打てた累計文字数 × 正確率</strong>（正確率 = 正解打鍵 ÷ 総打鍵）。</li>
                <li>速く・正確に打つほど高得点。同点の場合はより正確な方が上位です。</li>
              </ul>
            </div>

            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "4px" }}>
                ⌨️ 出題と入力
              </div>
              <ul style={{ display: "grid", gap: "4px", margin: 0, paddingLeft: "18px" }}>
                <li>
                  1 プレイは <strong>同じ OSS リポジトリから 20 問</strong>。問題は GitHub Star
                  上位の寛容ライセンス OSS から自動抽出した関数本体です（コメント除去済み・依存型は同梱なし）。
                </li>
                <li>
                  <strong>改行は自動</strong>で次の行へ進みます（Enter 不要・行頭のインデントもまとめてスキップ）。
                  ただし<strong>行の途中にあるスペース</strong>は自分で打つ必要があります。
                </li>
                <li><strong>スキップ不可</strong>。引いた関数は完走するか、時間切れまで打鍵します。</li>
                <li><strong>ペースト無効</strong>。大文字小文字・記号はそのまま区別します。</li>
              </ul>
            </div>

            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: "4px" }}>
                🏆 記録・ランキング・特典
              </div>
              <ul style={{ display: "grid", gap: "4px", margin: 0, paddingLeft: "18px" }}>
                <li>
                  ログインなしでも遊べますが、<strong>GitHub 連携でスコアが記録</strong>され、月間・全期間（殿堂入り）ランキングに参加できます。
                </li>
                <li>
                  ベストスコアで <strong>エンジニアグレード（Intern → … → Fellow）</strong>
                  が上がり、昇格や上位入賞で Typing Royale オリジナルの SVG バッジ・達成カードを獲得できます。
                </li>
              </ul>
            </div>
          </div>
        </div>

      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a> · <a href="#">ライセンス一覧</a>
      </div>
    </>
  )
}
