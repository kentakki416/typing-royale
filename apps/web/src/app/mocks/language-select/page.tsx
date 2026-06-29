import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "言語カード デザイン案 - Typing Royale",
}

/**
 * 言語選択カードのデザイン案を並べて比較するためのモックページ（/mocks/language-select）。
 *
 * テーマ: 「JS / TS / Go の文字色だけを言語カラーにする」。
 * 既存の派手な 3D グリフ（{@link file globals.css} の .lang-icon）を抑えて、
 * 言語カラーは "文字" にだけ載せる方向で 3 案を提示する。
 * 採用案が決まったら apps/web/src/app/language-selector.tsx + globals.css に反映する。
 *
 * ⚠️ これは検討用のモック。採用後はこのディレクトリごと削除する。
 */

type Lang = {
  /** 言語カラー（文字に載せる色） */
  color: string
  /** カード見出しに出すフル言語名 */
  name: string
  /** モノグラム（TS / JS / Go） */
  short: string
}

const LANGS: ReadonlyArray<Lang> = [
  { color: "#4a9eff", name: "TypeScript", short: "TS" },
  { color: "#f7df1e", name: "JavaScript", short: "JS" },
  { color: "#6cbf3f", name: "Go", short: "Go" },
]

/**
 * デザイン案の共通フレーム。タイトル + 説明 + カード行（横一列）。
 */
function Proposal({
  children,
  description,
  title,
}: {
  children: React.ReactNode
  description: string
  title: string
}) {
  return (
    <section style={{ marginBottom: "56px" }}>
      <h2 style={{ marginBottom: "4px" }}>{title}</h2>
      <p className="text-sm text-muted" style={{ marginBottom: "20px" }}>
        {description}
      </p>
      <div
        className="lang-grid"
        style={{ "--lang-cols": 3, "--lang-grid-max": "940px" } as React.CSSProperties}
      >
        {children}
      </div>
    </section>
  )
}

/**
 * カード内の操作ボタン（案ごとに見た目を変えないよう共通化）。
 */
function CardButtons() {
  return (
    <div className="mt-16" style={{ display: "grid", gap: "8px" }}>
      <button className="btn btn-primary btn-play btn-block" type="button">
        ▶ 通常プレイ
      </button>
      <button className="btn btn-gold btn-block" type="button">
        ⚡ 神々に挑戦
      </button>
    </div>
  )
}

export default function LanguageSelectMockPage() {
  return (
    <div className="container container-wide" style={{ padding: "48px 0 96px" }}>
      <h1 style={{ marginBottom: "8px" }}>言語カード デザイン案</h1>
      <p className="text-sm text-muted" style={{ marginBottom: "48px" }}>
        テーマ:「JS / TS / Go の<strong>文字色だけ</strong>を言語カラーにする」。3 案を比較してください。
      </p>

      {/* 案 A: 大きな言語名だけを言語カラーにする（モノグラム廃止） */}
      <Proposal
        description="モノグラム（TS/JS/Go の大きなグリフ）を廃止し、言語名そのものを大きく言語カラーで見せる。最もシンプルで、色が乗るのは名前だけ。"
        title="案 A: 言語名カラー（アイコン廃止）"
      >
        {LANGS.map((lang) => (
          <div className="lang-card" key={lang.name} style={{ paddingTop: "28px" }}>
            <h3
              style={{
                color: lang.color,
                fontFamily: "var(--font-mono)",
                fontSize: "34px",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                marginBottom: "6px",
                textShadow: "0 1px 0 rgba(0,0,0,0.5)",
              }}
            >
              {lang.name}
            </h3>
            <CardButtons />
          </div>
        ))}
      </Proposal>

      {/* 案 B: モノグラムは中立色 + 言語名を言語カラー */}
      <Proposal
        description="モノグラムは灰色（中立）にして立体感を抑え、言語カラーは言語名のテキストにだけ載せる。アイコンの存在感は残しつつ色は名前へ。"
        title="案 B: 中立モノグラム + 名前カラー"
      >
        {LANGS.map((lang) => (
          <div className="lang-card" key={lang.name}>
            <div
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: "48px",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                marginBottom: "12px",
                textShadow: "0 1px 0 rgba(0,0,0,0.5)",
              }}
            >
              {lang.short}
            </div>
            <h3 style={{ color: lang.color, fontFamily: "var(--font-mono)", fontSize: "20px" }}>
              {lang.name}
            </h3>
            <CardButtons />
          </div>
        ))}
      </Proposal>

      {/* 案 C: モノグラムをフラットに言語カラー（3D 影なし）+ 名前は中立 */}
      <Proposal
        description="既存のモノグラムは活かしつつ、重い 3D 黒影をやめてフラットに言語カラーで塗る。色が乗るのは “文字” だけ、という最小変更案。"
        title="案 C: フラット言語カラー グリフ"
      >
        {LANGS.map((lang) => (
          <div className="lang-card" key={lang.name}>
            <div
              style={{
                color: lang.color,
                fontFamily: "var(--font-mono)",
                fontSize: "60px",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                marginBottom: "14px",
                textShadow: "none",
              }}
            >
              {lang.short}
            </div>
            <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "19px" }}>{lang.name}</h3>
            <CardButtons />
          </div>
        ))}
      </Proposal>
    </div>
  )
}
