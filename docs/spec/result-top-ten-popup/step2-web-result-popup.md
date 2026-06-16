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

const CONTENT: Record<Kind, { title: string; message: string; accent: string }> = {
  "all-time": {
    title: "🏆 殿堂入りにランクインしました",
    message: "他のユーザーがあなたに挑戦することが可能になります。",
    accent: "var(--gold-light, #ffd54a)",
  },
  "monthly": {
    title: "📅 月間 TOP 10 にランクインしました",
    message: "他のユーザーがあなたのタイピングを視聴することが可能になります。",
    accent: "var(--accent, #58a6ff)",
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

`useState` でキュー管理、`useEffect` でリザルト到達時に判定して push:

```tsx
const [announcementQueue, setAnnouncementQueue]
  = useState<("all-time" | "monthly")[]>([])

useEffect(() => {
  if (result === null || isGuest) return
  const queue: ("all-time" | "monthly")[] = []

  /** 殿堂入り入賞: 既存ロジックと同じ */
  if (result.top_ten_boundary_score !== null
      && result.score > result.top_ten_boundary_score) {
    queue.push("all-time")
  }

  /** 月間 TOP 10 入賞: boundary null は誰でも入賞、boundary <= 自分なら入賞 */
  if (result.monthly_top_ten_boundary_score === null
      || result.score >= result.monthly_top_ten_boundary_score) {
    queue.push("monthly")
  }

  if (queue.length > 0) setAnnouncementQueue(queue)
  /** eslint-disable-next-line react-hooks/exhaustive-deps */
}, [isGuest, result])

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
- ゲスト (`isGuest === true`) は判定せず queue が空のまま (= ポップアップ無し)
- `result.monthly_top_ten_boundary_score` は `/finish` レスポンスに含まれる前提 (step1 で追加済み)

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

- `docs/screenshots/result-top-ten-popup/all-time.png` (殿堂入りポップアップ)
- `docs/screenshots/result-top-ten-popup/monthly.png` (月間ポップアップ)
- `docs/screenshots/result-top-ten-popup/no-popup.png` (両方非該当のリザルト)

### console / 動作

- console エラー 0
- `<dialog>` の showModal で focus trap + backdrop が機能している
- ESC キーでも閉じられる (dialog の標準挙動)
