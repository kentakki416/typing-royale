# step2: Web — `<TopTenAnnouncementModal>` + ResultScreen キュー順次表示

リザルト画面到達直後に、サーバー判定済みの結果に基づいて「殿堂入り入賞 → 月間 TOP 10 入賞」の順でポップアップを順次表示する。

## 対応内容

### 1. 新規コンポーネント (`apps/web/src/components/top-ten-announcement-modal.tsx`)

`<dialog>` ベースの汎用通知モーダル。`kind` で文言を出し分け、閉じるボタンだけのシンプル UI:

```tsx
"use client"
import { useEffect, useRef } from "react"

type Kind = "all-time" | "monthly"
type Props = { kind: Kind; onClose: () => void; open: boolean }

const CONTENT: Record<Kind, { title: string; message: string; accent: string; textGlow: string }> = {
  "all-time": {
    title: "🏆 殿堂入りにランクインしました",
    message: "他のユーザーがあなたに挑戦することが可能になります。",
    accent: "#ffd54a",
    textGlow: "0 0 12px rgba(255, 213, 74, 0.6)",
  },
  "monthly": {
    title: "🏆 月間 TOP 10 にランクインしました",
    message: "他のユーザーがあなたのタイピングを視聴することが可能になります。",
    accent: "#7dd3fc",
    textGlow: "0 0 12px rgba(125, 211, 252, 0.6)",
  },
}

export function TopTenAnnouncementModal({ kind, onClose, open }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const content = CONTENT[kind]
  useEffect(() => {
    const el = dialogRef.current
    if (el === null) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog ref={dialogRef} onClose={onClose} /* style 詳細省略 */>
      <h2 style={{ color: content.accent }}>{content.title}</h2>
      <p>{content.message}</p>
      <button className="btn btn-primary" onClick={onClose}>OK</button>
    </dialog>
  )
}
```

### 2. ResultScreen (`apps/web/src/app/play/[sessionId]/result-screen.tsx`)

`useState` の lazy initializer で `result` から直接 queue を 1 度だけ構築する。`result` はリザルト到達時点で確定しており後から変わらないため、useEffect での再計算は不要:

```tsx
const [announcementQueue, setAnnouncementQueue] = useState<("all-time" | "monthly")[]>(() => {
  /** ゲスト (= persisted=false) は対象外 */
  if (!result.persisted) return []
  const queue: ("all-time" | "monthly")[] = []

  /** 殿堂入り入賞: null は全期間 10 件未満で誰でも入賞、>= は upsert 後の自分の score と一致するケースを含む */
  if (result.top_ten_boundary_score === null
      || result.score >= result.top_ten_boundary_score) {
    queue.push("all-time")
  }

  /** 月間 TOP 10 入賞: boundary null は誰でも入賞、boundary <= 自分なら入賞 */
  if (result.monthly_top_ten_boundary_score === null
      || result.score >= result.monthly_top_ten_boundary_score) {
    queue.push("monthly")
  }

  return queue
})

const closeTopAnnouncement = () => {
  setAnnouncementQueue((prev) => prev.slice(1))
}

return (
  <>
    {/* 既存リザルト本体 ... */}

    {/* TOP 10 入賞お知らせ (順次) */}
    {announcementQueue.length > 0 && (
      <TopTenAnnouncementModal
        kind={announcementQueue[0]}
        onClose={closeTopAnnouncement}
        open
      />
    )}
  </>
)
```

ポイント:

- `queue.length > 0 && <Modal />` で「先頭の kind だけ表示」、`onClose` で先頭を削除して次があれば自動で次が表示される
- ゲスト判定は `!result.persisted` で揃える (= ランキング登録されていない => ポップアップ無し)
- `result.monthly_top_ten_boundary_score` は `/finish` レスポンスに含まれる前提 (step1 で追加済み)

### 演出

`<TopTenAnnouncementModal>` には以下のアニメーション演出を載せる:

- **textGlow**: タイトル文字に `text-shadow` で `kind` ごとの accent カラーの glow をかける (CONTENT の `textGlow` フィールド)
- **scale-in アニメ**: モーダル本体は表示時に `transform: scale(0.92) → scale(1)` + `opacity: 0 → 1` で軽くポップアップ
- **紙吹雪 Lottie**: 背面に `@lottiefiles/dotlottie-react` の `<DotLottieReact />` で `/celebration.lottie` を `autoplay loop={false}` で再生し、入賞のお祝い感を出す (モーダルの z-index より低く、本体テキストを邪魔しない)

### 3. 既存「TOP 10 入り見込み」インラインカードはそのまま残す

リザルト本体中の「🏆 TOP 10 入り見込み！殿堂入りに掲載されます。記念にコメントを残しませんか？」カード ([rewards spec](../../rewards/README.md)) は **コメント入力導線として残す**。本機能のポップアップとは役割が違うので併存可。

## 動作確認

### Playwright での確認

1. ログインユーザーで /play → 通常プレイ → 完走 (or finish API 直叩き)
2. リザルト画面到達:
   - **殿堂入り入賞条件を満たす**: 「🏆 殿堂入りにランクインしました」ポップアップが表示
   - 「OK」で閉じる
   - **月間 TOP 10 入賞条件も満たす**: 「📅 月間 TOP 10 にランクインしました」ポップアップが続けて表示
   - 「OK」で閉じる → 通常リザルト本体が見える
3. **どちらも該当しない**: ポップアップ 0 枚で即リザルト本体表示

### スクショ

撮影未完了 (TODO):

- `docs/screenshots/result-top-ten-popup/all-time.png` (殿堂入りポップアップ)
- `docs/screenshots/result-top-ten-popup/monthly.png` (月間ポップアップ)
- `docs/screenshots/result-top-ten-popup/no-popup.png` (両方非該当のリザルト)

### console / 動作

- console エラー 0
- `<dialog>` の showModal で focus trap + backdrop が機能している
- ESC キーでも閉じられる (dialog の標準挙動)
